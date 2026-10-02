import React, { useEffect } from 'react';
import { useUI } from '../state/ui';
import { useDoc } from '../state/store';
import { ExportDialog } from './ExportDialog';
import {
  BatesDialog,
  CompressDialog,
  DigitalSignDialog,
  HeaderFooterDialog,
  MetadataDialog,
  OcrDialog,
  PageNumbersDialog,
  SecurityDialog,
  SignDialog,
  SplitDialog,
  WatermarkDialog,
} from './dialogs/Overlays';
import {
  AboutDialog,
  AttachmentsDialog,
  JavascriptDialog,
  NewDocumentDialog,
  PrintDialog,
  SaveAsDialog,
  ShortcutsDialog,
  StampDialog,
} from './dialogs/Info';
import { addImageToPage, importFiles, pickFiles } from './actions';

/**
 * Single mount point — exactly one modal is visible at a time. A few dialog ids
 * are really commands (open a picker, place an image), so they are handled here
 * as side effects instead of rendering a modal.
 */
export const Dialogs: React.FC = () => {
  const dialog = useUI((s) => s.dialog);
  const closeDialog = useUI((s) => s.closeDialog);
  const props = { onClose: closeDialog };

  /* Command-style dialog ids. */
  useEffect(() => {
    if (dialog === 'open') {
      void pickFiles().then((files) => {
        if (files.length) void importFiles(files, { replace: true });
      });
      closeDialog();
    }
    if (dialog === 'insert-image') {
      const page = useDoc.getState().pages.filter((p) => !p.deleted)[useUI.getState().currentPage];
      if (page) void addImageToPage(page.id);
      closeDialog();
    }
  }, [dialog, closeDialog]);

  return (
    <>
      <ExportDialog open={dialog === 'export'} {...props} />
      <SecurityDialog open={dialog === 'security'} {...props} />
      <SignDialog open={dialog === 'sign'} {...props} />
      <DigitalSignDialog open={dialog === 'digital-sign'} {...props} />
      <OcrDialog open={dialog === 'ocr'} {...props} />
      <WatermarkDialog open={dialog === 'watermark'} {...props} />
      <HeaderFooterDialog open={dialog === 'header-footer'} {...props} />
      <PageNumbersDialog open={dialog === 'page-numbers'} {...props} />
      <BatesDialog open={dialog === 'bates'} {...props} />
      <MetadataDialog open={dialog === 'metadata'} {...props} />
      <CompressDialog open={dialog === 'compress'} {...props} />
      <SplitDialog open={dialog === 'split'} {...props} />
      <AttachmentsDialog open={dialog === 'attachments'} {...props} />
      <JavascriptDialog open={dialog === 'javascript'} {...props} />
      <StampDialog open={dialog === 'insert-stamp'} {...props} />
      <PrintDialog open={dialog === 'print'} {...props} />
      <SaveAsDialog open={dialog === 'save-as'} {...props} />
      <NewDocumentDialog open={dialog === 'new-document'} {...props} />
      <AboutDialog open={dialog === 'about'} {...props} />
      <ShortcutsDialog open={dialog === 'shortcuts'} {...props} />
    </>
  );
};
