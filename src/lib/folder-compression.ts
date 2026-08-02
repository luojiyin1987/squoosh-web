export interface FolderImage {
  file: File
  relativePath: string
}

interface FileEntry {
  file: (success: (file: File) => void, error: (error: DOMException) => void) => void
  isDirectory: false
  isFile: true
  name: string
}

interface DirectoryReader {
  readEntries: (
    success: (entries: DroppedFileSystemEntry[]) => void,
    error: (error: DOMException) => void,
  ) => void
}

interface DirectoryEntry {
  createReader: () => DirectoryReader
  isDirectory: true
  isFile: false
  name: string
}

export type DroppedFileSystemEntry = FileEntry | DirectoryEntry

export function isSupportedImage(file: File): boolean {
  return file.type.startsWith('image/')
}

export function getFolderImages(files: FileList | File[]): FolderImage[] {
  return Array.from(files)
    .filter(isSupportedImage)
    .map((file) => ({
      file,
      relativePath: file.webkitRelativePath || file.name,
    }))
}

export async function getDroppedFolderImages(
  entries: DroppedFileSystemEntry[],
): Promise<FolderImage[]> {
  const images: FolderImage[] = []

  for (const entry of entries) {
    await readEntry(entry, '', images)
  }

  return images
}

export function createUniquePath(path: string, usedPaths: Set<string>): string {
  const normalizedPath = path.toLowerCase()

  if (!usedPaths.has(normalizedPath)) {
    usedPaths.add(normalizedPath)
    return path
  }

  const dotIndex = path.lastIndexOf('.')
  const base = dotIndex >= 0 ? path.slice(0, dotIndex) : path
  const extension = dotIndex >= 0 ? path.slice(dotIndex) : ''
  let index = 2
  let candidate = `${base}-${index}${extension}`

  while (usedPaths.has(candidate.toLowerCase())) {
    index += 1
    candidate = `${base}-${index}${extension}`
  }

  usedPaths.add(candidate.toLowerCase())
  return candidate
}

async function readEntry(
  entry: DroppedFileSystemEntry,
  parentPath: string,
  images: FolderImage[],
): Promise<void> {
  const relativePath = `${parentPath}${entry.name}`

  if (entry.isFile) {
    const file = await readFile(entry)
    if (isSupportedImage(file)) {
      images.push({ file, relativePath })
    }
    return
  }

  const children = await readAllEntries(entry.createReader())
  for (const child of children) {
    await readEntry(child, `${relativePath}/`, images)
  }
}

function readFile(entry: FileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

async function readAllEntries(reader: DirectoryReader): Promise<DroppedFileSystemEntry[]> {
  const entries: DroppedFileSystemEntry[] = []
  let batch: DroppedFileSystemEntry[]

  do {
    batch = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    entries.push(...batch)
  } while (batch.length > 0)

  return entries
}
