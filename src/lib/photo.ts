// Profile photo glue (SPEC §10: HEIC/large → JPEG ≤ 600 px long edge; picker cancelled → no change). The system photo
// picker needs no permission. The stored path is relative to the document directory (`photos/…`); a new file is written
// first, the profile row points to it, and only then the old file goes (D62 idea: never lose the photo on a failure).
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getProfile, updateProfile } from '@/db/profile';

const FOLDER = 'photos';
export const MAX_EDGE = 600;

export function photoUri(relative: string | null): string | null {
  return relative ? new File(Paths.document, relative).uri : null;
}

function newName(): string {
  return `${FOLDER}/photo-${Date.now()}.jpg`;
}

function removeQuietly(relative: string | null) {
  if (!relative || !relative.startsWith(`${FOLDER}/`) || relative.includes('..')) return;
  try {
    const file = new File(Paths.document, relative);
    if (file.exists) file.delete();
  } catch {
    // A leftover photo file is harmless; the database is the source of truth.
  }
}

/**
 * Deletes a temporary file the picker or the manipulator wrote into the app's cache folder (v1.1, D91: the picker's
 * copy is the ORIGINAL file, full size with its metadata, e.g. the location). Never touches anything outside the
 * cache folder (an Android content:// URI or the photo library stays as it is).
 */
export function removeCacheCopy(uri: string | null | undefined) {
  if (!uri || !uri.startsWith(Paths.cache.uri) || uri.includes('..')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Delete all data removes the cache folders anyway (CACHE_DIRS in data-files.ts).
  }
}

/** Resizes an image file to a JPEG with its long edge ≤ 600 px into the photos folder; returns the relative path. */
async function storeImage(sourceUri: string, width: number, height: number): Promise<string> {
  new Directory(Paths.document, FOLDER).create({ idempotent: true, intermediates: true });
  let resultUri: string | null = null;
  try {
    const context = ImageManipulator.manipulate(sourceUri);
    if (Math.max(width, height) > MAX_EDGE) context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    resultUri = result.uri;
    const name = newName();
    await new File(result.uri).copy(new File(Paths.document, name));
    return name;
  } finally {
    // Only the reduced copy in photos/ stays: the picker's copy of the original and the manipulator's file go now.
    removeCacheCopy(resultUri);
    removeCacheCopy(sourceUri);
  }
}

/** Opens the system picker; returns false when cancelled. */
export async function pickAndStorePhoto(db: SQLiteDatabase): Promise<boolean> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  if (picked.canceled || picked.assets.length === 0) return false;
  const asset = picked.assets[0];
  const name = await storeImage(asset.uri, asset.width, asset.height);
  const old = (await getProfile(db)).photoFile;
  await updateProfile(db, { photoFile: name });
  removeQuietly(old);
  return true;
}

export async function removePhoto(db: SQLiteDatabase): Promise<void> {
  const old = (await getProfile(db)).photoFile;
  await updateProfile(db, { photoFile: null });
  removeQuietly(old);
}

// An 80 × 100 px blue JPEG for the dev link `debug/photo` (the simulator's photo library is empty).
export const FIXTURE_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAUKADAAQAAAABAAAAZAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAZABQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMABAQEBAQEBgQEBgkGBgYJDAkJCQkMDwwMDAwMDxIPDw8PDw8SEhISEhISEhUVFRUVFRkZGRkZHBwcHBwcHBwcHP/bAEMBBAUFBwcHDAcHDB0UEBQdHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHf/dAAQABf/aAAwDAQACEQMRAD8A54CpQKAKlAr7Rs8imwAqUCgCpAKybPQpsAKlAoAqUCsWz0KbACpQKAKlArJs9CmwAqQCgCpQKybPQps//9DIAqQCgCpQK+vbPBpyACpQKAKlArFs9CnIAKlAoAqQCsmz0KcgAqUCgCpQKybPQpyACpQKAKkArFs9CnI//9GiBUoFAFSgV9S2fN02AFSAUAVKBWTZ6FNgBUoFAFSgVk2ehTYAVKBQBUgFYtnoU2AFSgUAVKBWTZ6FNn//0ogKlAoAqUCvpGz5SnIAKlAoAqUCsmz0KcgAqQCgCpQKxbPQpyACpQKAKlArJs9CnIAKlApAKlArJs9CnI//05QKlAoAqQCvfbPjacgAqUCgCpQKxbPQpyACpQKAKkArJs9CnIUCpAKAKlArJs9CnIAKlAoAqUCsWz0Kcj//1LwFSgUAVKBXstnw9NgBUoFAFSAVk2ehTYAVKBQBUoFZNnoU2AFSgUAVIBWLZ6FNigVIBQBUoFZNnoU2f//V11qQVGtSivWZ8FTJBUoqMVKKxZ6FMkWpVqIVKtZM9CmSCpRUYqUVkz0KZIKlWoxUgrFnoUz/2Q==';

export async function seedFixturePhoto(db: SQLiteDatabase): Promise<void> {
  new Directory(Paths.document, FOLDER).create({ idempotent: true, intermediates: true });
  const name = newName();
  new File(Paths.document, name).write(FIXTURE_JPEG_BASE64, { encoding: 'base64' });
  const old = (await getProfile(db)).photoFile;
  await updateProfile(db, { photoFile: name });
  removeQuietly(old);
}
