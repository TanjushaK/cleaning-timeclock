/**
 * Локальное файловое хранилище для фото (UPLOAD_ROOT / signed URLs).
 * Использует тот же {@link StorageShim}, что и compat-клиент — без второго контура.
 */
import { StorageShim } from '@/lib/server/compat/storage-shim'

const shimSingleton = new StorageShim()

export function localPhotoBucket(bucket: string) {
  return shimSingleton.from(bucket)
}
