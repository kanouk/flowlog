import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface UseImageAttachmentsOptions {
  maxImages: number;
}

export function useImageAttachments({ maxImages }: UseImageAttachmentsOptions) {
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const selectedImagesRef = useRef<File[]>([]);
  const previewUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const addFiles = useCallback((files: File[], showPasteSuccessToast = false) => {
    if (files.length === 0) return;

    const remaining = maxImages - selectedImagesRef.current.length;
    if (remaining <= 0) {
      toast.error(`画像は最大${maxImages}枚までです`);
      return;
    }

    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.warning(`最大${maxImages}枚のため、${remaining}枚のみ追加しました`);
    }

    const newPreviews = toAdd.map((file) => URL.createObjectURL(file));
    setSelectedImages((prev) => [...prev, ...toAdd]);
    setPreviewUrls((prev) => [...prev, ...newPreviews]);

    if (showPasteSuccessToast) {
      toast.success(`画像を${toAdd.length}枚追加しました`);
    }
  }, [maxImages]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    e.target.value = '';
  }, [addFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;

    e.preventDefault();
    addFiles(imageFiles, true);
  }, [addFiles]);

  const removeImage = useCallback((index: number) => {
    const target = previewUrlsRef.current[index];
    if (target) {
      URL.revokeObjectURL(target);
    }

    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const resetImages = useCallback(() => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    setSelectedImages([]);
    setPreviewUrls([]);
  }, []);

  return {
    selectedImages,
    previewUrls,
    handleImageSelect,
    handlePaste,
    removeImage,
    resetImages,
  };
}
