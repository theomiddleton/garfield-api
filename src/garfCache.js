import path from 'path'
import {List} from 'immutable'
import {randomInt} from './utils'
import {GarfError} from './garf-error'

export class GarfCache extends List {
    constructor(garfs) {
        if (List.isList(garfs) === false) throw new TypeError('garfs must be a List')
        if (garfs.count() === 0) throw new Error('garfs must have garfields in it')
        if (garfs.every(garf => typeof garf === 'string') === false) throw new Error('only garfield strings allowed')
        super(garfs)
    }

    random = () => this.get(randomInt(this.count()))

    applyFilters = (filters, includeMode) => {
        filters = filters.map(filter => filter.toLowerCase())
        const filteredGarfs = this.filter(garf => {
            const ext = path.extname(garf).toLowerCase().substring(1)
            return filters.includes(ext) === includeMode
        })
        if (filteredGarfs.count() === 0) throw new GarfError('No garfields left after applying filter :(', 400)
        return new GarfError(filteredGarfs)
    }
}   
