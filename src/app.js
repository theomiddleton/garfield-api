import bodyParser from 'body-parser'
import express from 'express'
import fileUpload from 'express-fileupload'
import cookieParser from 'cookie-parser'
import path from 'path'
import ua from 'universal-analytics'
import uuidV4 from 'uuid/v4'
import exphbs from 'express-handlebars'
import {List} from 'immutable'
//import { checkHash } from './hash-util'
import { garfFolderName, getGarfsCount, getNewGarfs, getGoodGarfs, rejectGarf, acceptGarf, getGarfFileSize } from './fs-layer'

import { GarfError } from './garf-error'
import { GarfCache } from './garfCache'
import {Storage} from '@google-cloud/storage'

const bucketName = 'garfield-api-img'

const filePath = './img/garfield.jpg'

const destFileName = 'garfield.jpg'

const storage = new Storage()

async function uploadFile() {
    const options = {
        destination: destFileName
    }

    await storage.bucket(bucketName).upload(filePath, options)
    console.log(`${filePath} uploaded to ${bucketName}.`)
}

uploadFile().catch(console.error)


let immortalGarfs = 0

async function updateGarfsCount() {
    immortalGarfs = await getGarfsCount()
}

updateGarfsCount()

const jsonParser = bodyParser.json()

export const createApp = async (host) => {
    let cache = new GarfCache(new List(await getGoodGarfs()))

    setInterval(() => {
        updateCache()
    }, 20000)

    async function updateCache() {
        try {
            const newGarfs = await getGoodGarfs()
            cache = new GarfCache(new List(newGarfs))
            updateGarfsCount()
        } catch (error) {
            console.error(error.stack)
        }
    }

    const app = express()

    app.engine('handlebars', exphbs({defaultLayout: false}))

    app.set('view engine', 'handlebars')

    app.use(ua.middleware('UA-50585312-4', {cookieName: '_ga', https: true}))

    app.use(cookieParser())

    app.use(fileUpload({
        limits: {
            fileSize: 50 * 1024 * 1024,
            fields: 100,
            files: 1,
            parts: 101
        },
    }))

    app.use((req, res, next) => {
        log(`NEW REQUEST: ${getDateTime()}  ${req.method} ${req.url} ${req.body ? JSON.stringify(req.body) : ''}`)
        next()
    })

    function setCORSHeaders(res) {
        res.header('Access-Control-Allow-Origin', '*')
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
        res.header('Access-Control-Allow-Methods', 'GET')
    }

    //API
    app.get('*', (req, res, next) => {
        req.visitor.event('*', 'GET', 'api',).send()
        setCORSHeaders(res)

        if (req.headers.referer && req.headers.referer.endsWith('/review')) {
            //if (isAuthorized(req) !== true) {
            //    req.visitor.event('/review/*', 'GET 401 Unauthorized', 'api').send()
            //    return next(new GarfError('Unauthorized', 401))
            //}
        express.static(garfFolderName.new)(req, res, next)
        } else {
            express.static(garfFolderName.approved)(req, res, next)
        }
    })

    app.get('/garf', (req, res) => {
        req.visitor.event('/garf', 'GET', 'api').send()
        setCORSHeaders(res)
        res.status(200).send(getGarfsMaybeWithFilter(req).random())
    })

    app.get('/garf.json', async (req, res) => {
        req.visitor.event('/garf.json', 'GET', 'api').send()
        setCORSHeaders(res)
        const garfName = getGarfsMaybeWithFilter(req).random()
        const fileSizeBytes = await getGarfFileSize(garfName)
        res.status(200).json({
            fileSizeBytes,
            url: `${host}/${garfName}`
        })
    })

    app.get('/Garfields', async (req, res) => {
        req.visitor.event('Garfields', 'GET', 'api').send()
        setCORSHeaders(res)
        res.status(200).json(getGarfsMaybeWithFilter(req))
    })

    function getGarfsMaybeWithFilter(req) {
        if (req.query.filter) {
            const filters = req.query.filter.split(',')
            return cache.applyFilters(filters, true)
        } else if (req.query.include) {
            const filters = req.query.include.split(',')
            return cache.applyFilters(filters, true)
        } else {
            return cache
        }
    }

    app.post('/upload', async (req, res) => {
        req.visitor.event('upload', 'POST', 'api').send()

        if (!req.files) {
            req.visitor.event('upload', 'POST 400 No files were uploaded', 'api').send()
            return res.status(400).send('No files were uploaded.')
        }

        const newGarfs = await getNewGarfs()
        
        // Limit the number of new garfs to 250
        if (newGarfs.length >= 250) {
            req.visitor.event('upload', 'POST 429 Too many new garfs', 'api').send()
            return res.status(429).send('Too many new garfs, please try again later.')
        }

        const uploadedFile = req.files.upload_file

        const acceptedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm']

        if (acceptedMimeTypes.indexOf(uploadedFile.mimetype) === -1) {
            req.visitor.event('upload', 'POST 415 Unsupported Media Type', 'api').send()
            return res.status(415).send('Unsupported Media Type, please upload a JPEG, PNG, GIF, MP4 or WEBM file.')
        }

        uploadedFile.mv('./newgarfs/' + uuidV4() + path.extname(uploadedFile.name))

        req.visitor.event('upload', 'successful upload', 'api').send()
        return res.status(200).send('File uploaded!')
    })

    app.post('/review', jsonParser, async (req, res, next) => {
        const {visitor, body} = req

        visitor.event('/review', 'POST', 'api').send()

        //if (isAuthorized(req) !== true) {
        //    visitor.event('/review', 'POST 401 Unauthorized', 'api').send()
        //    return next(new GarfError('Unauthorized', 401))
        //}

        if (!body) {
            visitor.event('/review', 'POST 400 No body', 'api').send()
            return res.status(400).send('No body')
        }

        const garfName = body.garfName

        if (['reject', 'accept'].includes(body.action) === false) {
            visitor.event('review', 'POST 400 Invalid action', 'api').send()
            return next(new GarfError('Invalid action', 400))
        }

        if (!garfName || garfName.length < 3) {
            visitor.event('review', 'POST 400 Invalid garfName', 'api').send()
            return next(new GarfError('Invalid garfName', 400))
        }

        try {
            if (body.action === 'reject') {
                await acceptOrRejectGarf(rejectGarf, garfName, res, 'garf rejected', visitor)
            } else {
                await acceptOrRejectGarf(acceptGarf, garfName, res, 'garf accepted', visitor)
            }
        } catch (error) {
            return next(error)
        }

        async function acceptOrRejectGarf(fn, garfName, res, message, visitor) {
            await fn(garfName)
            updateCache()
            visitor.event('review', message, 'api').send()
            log(`Garf ${message}: ${garfName}`)
            res.status(200).send(message)
        }
    })

    //Pages
    app.get('/', (req, res) => {
        req.visitor.event('/', 'GET', 'page').send()
        const garf = cache.random()

        res.render('helloworld.handlebars', {
            [getGarfType(garf)]: garf,
            adopted: immortalGarfs
        })
    })

    app.get('/upload', async (req, res) => {
        req.visitor.event('/upload', 'GET', 'page').send()

        const newGarfs = await getNewGarfs()

        res.render('upload', {garf : newGarfs, waitinggarfs: newGarfs.length})
    })

    app.get('/review', async (req, res) => {
        req.visitor.event('/review', 'GET', 'page').send()

        //if (isAuthorized(req) !== true) {
        //    req.visitor.event('review', 'GET 401 Unauthorized', 'page').send()
        //    return res.sendStatus(401)
        //}

        const newGarfs = await getNewGarfs()

        if (newGarfs.length === 0) return res.status(200).send('No new garfs to review')

        const garf = newGarfs[0]

        res.render('review', {
            [getGarfType(garf)]: garf,
            garf: garf,
            bone: req.query.bone,
            waitinggarfs: newGarfs.length,
            s: newGarfs.length === 1 ? 's' : ''
        })
    })

    //other
    app.get('/favicon.ico', (req, res, next) => {
        req.visitor.event('/favicon.ico', 'GET', 'page').send()
        express.static('.')(req, res, next)
    })
    app.get('/sitemap.txt', (req, res, next) => {
        req.visitor.event('/sitemap.txt', 'GET', 'page').send()
        express.static('.')(req, res, next)
    })

    // eslint-disable-next-line no-unused-vars
    app.use(function (err, req, res, next) {
        if (isGarfErrorType400(err)) {
            return res.status(err.garfErrorType).send(err.message)
        } else {
            console.error(err.stack)
            return res.status(500).send('Something broke!')
        }
    })

    return app
}

//function isAuthorized(req) {
//    if (!req.cookies.bone) return false
//    return checkHash(Buffer.from(req.cookies.bone, 'base64').toString('acii'))
//}

function getGarfType(garf) {
    return path.extname(garf) == '.mp4' || path.extname(garf) == '.webm' ? 'garfmp4' : 'garfimg'
}

function isGarfErrorType400(err) {
    return err.garfErrorType && err.garfErrorType >= 400 && err.garfErrorType < 500
}



function getDateTime() {
    const date = new Date()

    let hour = date.getHours()
    hour = (hour < 10 ? '0' : '') + hour

    let min = date.getMinutes()
    min = (min < 10 ? '0' : '') + min

    let sec = date.getSeconds()
    sec = (sec < 10 ? '0' : '') + sec

    let year = date.getFullYear()

    let month = date.getMonth() + 1
    month = (month < 10 ? '0' : '') + month

    let day = date.getDate()
    day = (day < 10 ? '0' : '') + day

    return year + ':' + month + ':' + day + ':' + hour + ':' + min + ':' + sec
}

function log(message) {
    if (process.env.NODE_ENV !== 'production') return
    console.log(message)
}