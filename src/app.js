import express from 'express'
import fileUpload from 'express-fileupload'
import cookieParser from 'cookie-parser'
import path from 'path'
import exphbs from 'express-handlebars'
import {List} from 'immutable'
import {checkHash} from './hash-util'

import {garfFolderName, getGarfsCount, getGoodGarfs, getGarfFileSize} from './fs-layer'

import {garfError} from './garf-error'
import {GarfCache} from './garfCache'

let immortalGarfs = 0

async function updateGarfsCount() {
    immortalGarfs = await getGarfsCount()
}

updateGarfsCount()

export const createApp = async (host) => {
    //let cache = new GarfCache(new List(await getGoodGarfs()))

    let cache = new GarfCache(new List(await getGoodGarfs()))

    setInterval(() => {
        updateCache()
    }, 20000)

    async function updateCache() {
        try {
            const goodgarfs = await getGoodGarfs()
            cache = new GarfCache(new List(goodgarfs))
            updateGarfsCount()
        } catch (error) {
            console.error(error.stack)
        }
    }

    const app = express()

    app.engine('handlebars', exphbs({defaultLayout: false}))

    app.set('view engine', 'handlebars')

    //app.use(ua.middleware('UA-50585312-4', {cookieName: '_ga', https: true}))

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
        log(`NEW REQUEST: ${getDateTime()} GMT | ${req.method} ${req.url} ${req.body ? JSON.stringify(req.body) : ''}`)
        next()
    })

    function setCORSHeaders(res) {
        res.header('Access-Control-Allow-Origin', '*')
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
        res.header('Access-Control-Allow-Methods', 'GET')
    }

    // API
    app.get('*', (req, res, next) => {
        req.visitor.event('*', 'GET', 'api').send()
        setCORSHeaders(res)

        if (req.headers.referer && req.headers.referer.endsWith('/review')) {
            if (isAuthorized(req) !== true) {
                req.visitor.event('/review/*', 'GET 401 Unauthorized', 'api').send()
                return next(new garfError('no garf haters allowed :P', 401))
            }
            express.static(garfFolderName.new)(req, res, next)
        } else {
            express.static(garfFolderName.approved)(req, res, next)
        }
    })

    app.get('/garf', (req, res) => {
        req.visitor.event('garf', 'GET', 'api').send()
        setCORSHeaders(res)
        res.status(200).send(getgarfsMaybeWithFilter(req).random())
    })

    app.get('/garf.json', async (req, res) => {
        req.visitor.event('garf.json', 'GET', 'api').send()
        setCORSHeaders(res)
        const garfName = getgarfsMaybeWithFilter(req).random()
        const fileSizeBytes = await getGarfFileSize(garfName)
        res.status(200).json({
            fileSizeBytes,
            url: `${host}/${garfName}`
        })
    })

    app.get('/garfields', async (req, res) => {
        req.visitor.event('garfeilds', 'GET', 'api').send()
        setCORSHeaders(res)
        res.status(200).json(getgarfsMaybeWithFilter(req))
    })

    function getgarfsMaybeWithFilter(req) {
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
