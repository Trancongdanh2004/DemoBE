import path from 'path';

export type FileType = 'pdf' | 'word' | 'excel';

export interface ValidationResult {
  isValid: boolean;
  fileType?: FileType;
  extension?: string;
  error?: string;
}

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

const MIME_MAP: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/vnd.ms-word', 'application/x-msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
  ],
  '.xls': ['application/vnd.ms-excel', 'application/msexcel', 'application/x-msexcel'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
  ],
};

const OLE_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function fixUtf8FileName(str: string): string {
  try {
    const converted = Buffer.from(str, 'latin1').toString('utf8');
    // If the converted string contains valid characters, return it
    return converted;
  } catch {
    return str;
  }
}

export function validateFile(
  buffer: Buffer,
  originalName: string,
  reportedMime: string
): ValidationResult {
  const ext = path.extname(originalName).toLowerCase();

  // 1. Check extension
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      isValid: false,
      error: `Định dạng tệp "${ext}" không được hỗ trợ. Chỉ chấp nhận .pdf, .doc, .docx, .xls, .xlsx`,
    };
  }

  // 2. Map extension to file_type enum
  let fileType: FileType;
  if (ext === '.pdf') {
    fileType = 'pdf';
  } else if (ext === '.doc' || ext === '.docx') {
    fileType = 'word';
  } else {
    fileType = 'excel';
  }

  // 3. Verify reported MIME
  const allowedMimes = MIME_MAP[ext] || [];
  const normalizedMime = reportedMime.toLowerCase();
  const isMimeValid =
    allowedMimes.includes(normalizedMime) ||
    normalizedMime === 'application/octet-stream' ||
    normalizedMime.includes('officedocument') ||
    normalizedMime.includes('pdf');

  if (!isMimeValid) {
    return {
      isValid: false,
      error: `MIME type không hợp lệ (${reportedMime}) đối với định dạng ${ext}`,
    };
  }

  // 4. Magic Bytes Validation
  if (buffer.length < 4) {
    return {
      isValid: false,
      error: 'Tệp rỗng hoặc kích thước quá nhỏ, không hợp lệ',
    };
  }

  if (ext === '.pdf') {
    // PDF starts with %PDF- (0x25 0x50 0x44 0x46 0x2D)
    const pdfHeader = buffer.subarray(0, 5).toString('ascii');
    if (!pdfHeader.startsWith('%PDF-')) {
      return {
        isValid: false,
        error: 'Tệp PDF không hợp lệ (sai mã nhận dạng tệp - Magic Bytes)',
      };
    }
  } else if (ext === '.docx' || ext === '.xlsx') {
    // Modern Office XML files are ZIP archives starting with "PK" (0x50 0x4B)
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return {
        isValid: false,
        error: `Tệp ${ext.toUpperCase()} không hợp lệ (không phải định dạng nén OpenXML chuẩn)`,
      };
    }
  } else if (ext === '.doc' || ext === '.xls') {
    // Legacy Office files are OLE Compound Files: D0 CF 11 E0 A1 B1 1A E1
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(OLE_HEADER)) {
      return {
        isValid: false,
        error: `Tệp ${ext.toUpperCase()} không hợp lệ (sai mã nhận dạng tệp nhị phân)`,
      };
    }
  }

  return {
    isValid: true,
    fileType,
    extension: ext,
  };
}
