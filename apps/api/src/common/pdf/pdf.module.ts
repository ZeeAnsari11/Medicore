import { Module } from '@nestjs/common';
import { DocumentPdfService } from './document-pdf.service';

@Module({
  providers: [DocumentPdfService],
  exports: [DocumentPdfService],
})
export class PdfModule {}
