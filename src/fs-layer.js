import fs from 'fs-extra'
import {GarfError} from './garf-error'

export const garfFolderName = {
    new: 'newgarfs',
    approved: 'img',
    reject: 'rejects',
}
//
//fs.ensureDirSync(garfFolderName.new)
//fs.ensureDirSync(garfFolderName.approved)
//fs.ensureDirSync(garfFolderName.reject)
//
export function getGarfsCount() {
    return fs.readdir(garfFolderName.approved)
        .then(({length}) => length)
        .catch(console.err)
}

export const getNewGarfs = () => fs.readdir(garfFolderName.new + '/')
export const getGoodgarfs = () => fs.readdir(garfFolderName.approved + '/')

export async function rejectGarf(garfName) {
    const rejectGarfPath = `./${garfFolderName.new}/${garfName}`
    
    if (await fs.exists(rejectGarfPath) === false) throw new GarfError('garfName no exist', 400)

    await fs.move(rejectGarfPath, `./${garfFolderName.reject}/${garfName}`, {overwrite: true})
}

export async function adoptGarf(garfName) {
    const rejectGarfPath = `./${garfFolderName.new}/${garfName}`
    
    if (await fs.exists(rejectGarfPath) === false) throw new GarfError('garfName no exist', 400)

    await fs.move(rejectGarfPath, `./${garfFolderName.approved}/${garfName}`, {overwrite: true})
}

export async function getGarfFileSize(garfName) {
    const stat = await fs.stat(`./${garfFolderName.approved}/${garfName}`)
    return stat.size
}