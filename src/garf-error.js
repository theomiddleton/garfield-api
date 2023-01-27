export class GarfError extends Error {
    constructor(message, type) {
        super(message)
        this.GarfErrorType = type
    }
}
