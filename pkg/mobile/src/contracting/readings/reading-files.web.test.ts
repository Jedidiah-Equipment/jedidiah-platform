import { expect, test } from 'vitest';
import { ReadingPhotoUnavailableError } from './reading-files.web';

test('exports the photo error used by the platform-neutral sync path', () => {
  expect(new ReadingPhotoUnavailableError()).toMatchObject({
    name: 'ReadingPhotoUnavailableError',
    message: 'The saved meter photo is no longer available on this device.',
  });
});
