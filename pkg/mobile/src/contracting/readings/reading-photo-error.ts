export class ReadingPhotoUnavailableError extends Error {
  constructor() {
    super('The saved meter photo is no longer available on this device.');
    this.name = 'ReadingPhotoUnavailableError';
  }
}
