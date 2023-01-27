import {expect} from 'chai'
import sinon from 'sinon'
import request from 'supertest'
import express from 'express'
import {createApp} from '../src/app'
import * as fsLayer from '../src/fs-layer'
import * as hashUtil from '../src/hash-util'

describe('randomgarf', () => {
    let sandbox
    beforeEach(() => {
        sandbox = sinon.sandbox.create()
        sandbox.stub(fsLayer, 'getGoodgarfs').resolves(['testGarf.jpg'])
        sandbox.stub(fsLayer, 'adoptGarf')
        sandbox.stub(fsLayer, 'getGarfFileSize')
        sandbox.stub(hashUtil, 'checkHash').callsFake(key => key === 'goodKey')
    })
    afterEach(() => {
        sandbox.restore()
    })
    describe('get /garf', () => {
        it('should be garf', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['testGarf.jpg'])
            return request(await createApp('test_host'))
                .get('/garf')
                .expect('Content-Type', /text\/html/)
                .expect(200)
                .then(response => {
                    expect(response.text).to.equal('testGarf.jpg')
                })
        })
        it('should not return jpeg garfs when filter is jpg', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['testGarf.JPG', 'garf.png', 'testGarf.jpg'])
            return request(await createApp('test_host'))
                .get('/garf?filter=jpg')
                .expect('Content-Type', /text\/html/)
                .expect(200)
                .then(response => {
                    expect(response.text).to.equal('garf.png')
                })
        })
        it('should only return jpeg garfs when include is jpg', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['testGarf.mp4', 'testGarf.jpg', 'garf.png'])
            return request(await createApp('test_host'))
                .get('/garf?include=jpg')
                .expect('Content-Type', /text\/html/)
                .expect(200)
                .then(response => {
                    expect(response.text).to.equal('testGarf.jpg')
                })
        })
    })
    describe('get /garf.json', () => {
        it('should be garf', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['testGarf.jpg'])
            fsLayer.getGarfFileSize.resolves(67107)//this may change (the num)
            return request(await createApp('test_host'))
                .get('/garf.json')
                .expect('Content-Type', /json/)
                .expect(200)
                .then(response => {
                    expect(response.body.url).to.equal('test_host/testGarf.jpg')
                    expect(response.body.fileSizeBytes).to.equal(67107)//num subject to change
                })
        })
        it('should not return jpeg garfs when filter is garf', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['testGarf.jpg', 'garf.png', 'testGarf.JPG'])
            return request(await createApp('test_host'))
                .get('/garf.json?filter=jpg')
                .expect('Content-Type', /json/)
                .expect(200)
                .then(response => {
                    expect(response.body.url).to.equal('test_host/garf.png')
                })
        })
        it('should only return jpeg garfs when include is jpg', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['testGarf.mp4', 'testGarf.JPG', 'garf.png'])
            return request(await createApp('test_host'))
                .get('/garf.json?include=jpg')
                .expect('Content-Type', /json/)
                .expect(200)
                .then(response => {
                    expect(response.body.url).to.equal('test_host/testGarf.JPG')
                })
        })
    })//********************************ABOVE IS REFACTORED*********************************************************************************** */
    describe('get /garfields', () => {
        it('should return a lot of garfs', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['garfA', 'garfB'])
            return request(await createApp('test_host'))
                .get('/garfields')
                .expect('Content-Type', /application\/json/)
                .expect(200)
                .then(response => {
                    expect(response.body).to.deep.equal(['garfA', 'garfB'])
                })
        })
        it('should return filtered garfields', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['garfA.Jpg', 'garfB.png'])
            return request(await createApp('test_host'))
                .get('/garfields?filter=jpg')
                .expect('Content-Type', /application\/json/)
                .expect(200)
                .then(response => {
                    expect(response.body).to.deep.equal(['garfB.png'])
                })
        })
        it('should return included garfields', async () => {
            // @ts-ignore
            fsLayer.getGoodgarfs.resolves(['garfA.Jpg', 'garfB.png', 'garfB.mp4', 'garfZ.jpg'])
            return request(await createApp('test_host'))
                .get('/garfields?include=jpg')
                .expect('Content-Type', /application\/json/)
                .expect(200)
                .then(response => {
                    expect(response.body).to.deep.equal(['garfA.Jpg', 'garfZ.jpg'])
                })
        })
    })
    describe('get *', () => {
        it('should return 401 when referred from /review and no bone', async () => {
            return request(await createApp('test_host'))
                .get('/abc.jpg')
                .set('Referer', 'http://example.com/review')
                .expect(401)
        })
        it('should return 200 when referred from /review and good bone', async () => {
            sandbox.stub(express, 'static').callsFake(() => (req, res) => res.send(200))
            return request(await createApp('test_host'))
                .get('/myNewGarf.mp4')
                .set('Cookie', 'bone=' + Buffer.from('goodKey').toString('base64'))
                .set('Referer', 'http://example.com/review')
                .expect(200)
        })
        it('should return 200 when not referred from /review', async () => {
            sandbox.stub(express, 'static').callsFake(() => (req, res) => res.send(200))
            return request(await createApp('test_host'))
                .get('/myNewGarf.mp4')
                .expect(200)
        })
    })
    describe('/review', () => {
        describe('unauthorized', () => {
            ['get', 'post'].forEach(method => {
                describe(method, () => {
                    it('should return 401 when bone cookie not present', async () => {
                        return request(await createApp('test_host'))[method]('/review')
                            .set('Cookie', 'treat=goodKey')
                            .expect(401)
                    })
                    it('should return 401 when bone cookie is badKey', async () => {
                        return request(await createApp('test_host'))[method]('/review')
                            .set('Cookie', 'bone=badKey')
                            .expect(401)
                    })
                    it('should return 401 when bone cookie is decoded goodKey', async () => {
                        return request(await createApp('test_host'))[method]('/review')
                            .set('Cookie', 'bone=' + 'goodKey')
                            .expect(401)
                    })
                })
            })
        })
        describe('authorized', () => {
            describe('get', () => {
                it('should return 200 when bone cookie is encoded goodKey', async () => {
                    return request(await createApp('test_host'))
                        .get('/review')
                        .set('Cookie', 'bone=' + Buffer.from('goodKey').toString('base64'))
                        .expect(200)
                })
            })
            describe('post', () => {
                it('should return 200 when bone cookie is encoded goodKey', async () => {
                    return request(await createApp('test_host'))
                        .post('/review')
                        .set('Cookie', 'bone=' + Buffer.from('goodKey').toString('base64'))
                        .send({action: 'adopt', dogName: 'cliff'})
                        .expect(200)
                })
            })
        })
    })
})
