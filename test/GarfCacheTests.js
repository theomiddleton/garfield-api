import {expect} from 'chai'
import sinon from 'sinon'
import {List} from 'immutable'
import {garfCache} from '../src/garfCache'
import * as utils from '../src/utils'

describe('garfCache', () => {
    it('should throw a TypeError when passed undefined', () => {
        expect(() => new garfCache(undefined)).to.throw(TypeError, /^garfeilds must be a List$/)
    })
    it('should throw an Error when passed empty List', () => {
        expect(() => new garfCache(new List())).to.throw(Error, /^garfeilds must have garfeilds in it$/)
    })
    it('should throw an Error when passed List of numbers', () => {
        expect(() => new garfCache(new List([1]))).to.throw(Error, /^only garfield strings allowed$/)
    })
    it('should throw an Error when passed array of numbers and strings', () => {
        expect(() => new garfCache(new List(['1', 1, '1']))).to.throw(Error, /^only garfield strings allowed$/)
    })
    describe('random', () => {
        afterEach(() => utils.randomInt.restore && utils.randomInt.restore())
        it('should return 1st garfield when randomInt returns 0', () => {
            sinon.stub(utils, 'randomInt').returns(0)
            expect(new garfCache(new List(['garf1'])).random()).to.equal('garf1')
        })
        it('should return 2nd garfield when randomInt returns 1', () => {
            sinon.stub(utils, 'randomInt').returns(1)
            expect(new garfCache(new List(['garf1', 'garf2'])).random()).to.equal('garf2')
        })
    })
})