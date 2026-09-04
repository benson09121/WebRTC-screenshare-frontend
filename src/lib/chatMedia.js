const MAX_IMAGE_BYTES = 120_000;
const MAX_IMAGE_EDGE = 1280;

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected image could not be opened.'));
    };
    image.src = url;
  });

const dataUrlBytes = (value) => Math.ceil((value.length * 3) / 4);

export const prepareChatImage = async (file) => {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Choose a PNG, JPEG, WebP, or GIF image.');
  }

  const image = await loadImage(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(image.width, image.height),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let url = canvas.toDataURL('image/webp', quality);
  while (dataUrlBytes(url) > MAX_IMAGE_BYTES && quality > 0.32) {
    quality -= 0.1;
    url = canvas.toDataURL('image/webp', quality);
  }
  if (dataUrlBytes(url) > MAX_IMAGE_BYTES) {
    throw new Error('This image is still too large after compression.');
  }

  return { kind: 'image', url, alt: file.name || 'Shared image' };
};
