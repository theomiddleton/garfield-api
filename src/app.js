import express from 'express'
import fileUpload from 'express-fileupload'
//import cookieParser from 'cookie-parser'
import uuidV4 from 'uuid/v4'
import path from 'path'
import ua from 'universal-analytics'
import exphbs from 'express-handlebars'
import {List} from 'immutable'
import {checkHash} from './hash-util'

import {garfFolderName, getGarfsCount, getGoodGarfs, getGarfFileSize, getNewGarfs} from './fs-layer'

import {GarfError} from './garf-error'
import {GarfCache} from './garfCache'

let immortalGarfs = 0

async function updateGarfsCount() {
    immortalGarfs = await getGarfsCount()
}

updateGarfsCount()

export const createApp = async (host) => {
    let cache = new GarfCache(new List(await getGoodGarfs()))

    setInterval(() => {
        updateCache()
    }, 20000)

    async function updateCache() {
        try {
            const goodGarfs = await getGoodGarfs()
            cache = new GarfCache(new List(goodGarfs))
            updateGarfsCount()
        } catch (error) {
            console.error(error.stack)
        }
    }

    const app = express()

    app.engine('handlebars', exphbs({defaultLayout: false}))
    app.set('view engine', 'handlebars')
    app.set('trust proxy', true)
    // WHY THE FUCK DOES THIS ONE LINE MAKE MY CODE WORK!@!
    //WHAT THE FUCK
    app.use(ua.middleware('UA-201314959-2', {cookieName: '_ga', https: true}))
    //app.use(cookieParser())

    app.use(fileUpload({
        limits: {
            fileSize: 50 * 1024 * 1024,
            fields: 100,
            files: 1,
            parts: 101
        },
    }))

    app.use((req, res, next) => {
        log(`NEW REQUEST: ${getDateTime()} GMT | ${req.method} ${req.url} ${req.body ? JSON.stringify(req.body) : ''}`)
        next()
    })

    function setCORSHeaders(res) {
        res.header('Access-Control-Allow-Origin', '*')
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
        res.header('Access-Control-Allow-Methods', 'GET')
    }

    // API
    app.get(/^(?!.*_ah).*$/,(req,res,next)=>{
        req.visitor.event('*', 'GET', 'api').send()
        setCORSHeaders(res)

        if (req.headers.referer && req.headers.referer.endsWith('/review')) {
            if (isAuthorized(req) !== true) {
                req.visitor.event('/review/*', 'GET 401 Unauthorized', 'api').send()
                return next(new GarfError('no odies allowed :P', 401))
            }
            express.static(garfFolderName.new)(req, res, next)
        } else {
            express.static(garfFolderName.approved)(req, res, next)
        }
    })

    app.get('/garf', (req, res) => {
        req.visitor.event('garf', 'GET', 'api').send()
        setCORSHeaders(res)
        res.status(200).send(getGarfsMaybeWithFilter(req).random())
    })

    app.get('/garf.json', async (req, res) => {
        req.visitor.event('garf.json', 'GET', 'api').send()
        setCORSHeaders(res)
        const garfName = getGarfsMaybeWithFilter(req).random()
        const fileSizeBytes = await getGarfFileSize(garfName)
        res.status(200).json({
            fileSizeBytes,
            url: `${host}/${garfName}`
        })
    })

    app.get('/garfields', async (req, res) => {
        req.visitor.event('garfeilds', 'GET', 'api').send()
        setCORSHeaders(res)
        res.status(200).json(getGarfsMaybeWithFilter(req))
    })

    function getGarfsMaybeWithFilter(req) {
        if (req.query.filter) {
            const filters = req.query.filter.split(',')
            return cache.applyFilters(filters, false)
        } else if (req.query.include) {
            const includes = req.query.include.split(',')
            return cache.applyFilters(includes, true)
        } else {
            return cache
        }
    }

    app.post('/upload', async (req, res) => {
        req.visitor.event('upload', 'POST', 'api').send()

        if(!req.files) {
            req.visitor.event('upload', 'POST 400 No files were uploaded', 'api').send()
            return res.status(400).send('No files were uploaded.')
        }

        const newGarfs = await getNewGarfs()

        if (newGarfs.length >= 250) {
            req.visitor.event('upload', 'Too many Garfields :(', 'api').send()
            return res.status(200).send('Too many Garfields in queue, please try again later.')
        }

        const uploadedFile = req.files.upload_file
        const acceptedMineTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm']

        if (!acceptedMineTypes.includes(uploadedFile.mimetype)) {
            req.visitor.event('upload', 'POST 400 Wrong file type', 'api').send()
            return res.status(400).send('please upload a jpeg, png, gif, mp4, or webm garfields')
        }

        uploadedFile.mv('./newgarfs' + uuidV4() + path.extname(uploadedFile.name))

        req.visitor.event('upload', 'successful upload', 'api').send()
        return res.status(200).send('Garfield uploaded successfully!')
    })


    // Pages
    app.get('/', (req, res) => {
        req.visitor.event('/', 'GET', 'api').send()
        const Garfs = cache.random()

        res.render('helloworld.handlebars', {
            [getGarfType(Garfs)]: Garfs,
            adopted: immortalGarfs
        })
    })

    // Other
    app.get('/favicon.ico', (req, res, next) => {
        req.visitor.event('favicon.ico', 'GET', 'api').send()
        express.static('.')(req, res, next)
    })
    app.get('/sitemap.txt', (req, res, next) => {
        req.visitor.event('sitemap.txt', 'GET', 'api').send()
        //res.send('sitemap.txt', 'GET', 'api')
        express.static('.')(req, res, next)
    })

    // eslint-disable-next-line no-unused-vars
    app.use(function (err, req, res, next) {
        if (isGarfErrorType400(err)) {
            return res.status(err.garfErrorType).send(err.message)
        } else {
            console.error(err.stack)
            return res.status(500).send('something broke')
        }
    })

    return app
}

function isAuthorized(req) {
    if (!req.cookies.bone) return false
    return checkHash(Buffer.from(req.cookies.bone, 'base64').toString('ascii'))
}

// this line manages media types 

function getGarfType(Garfs) {
    return path.extname(Garfs) == '.mp4' || path.extname(Garfs) == '.webm' ? 'garfmp4' : 'garfimg'
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
    if (process.env.NODE_ENV === 'test') return
    console.log(message)
}
