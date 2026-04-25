import { Image } from '@imagekit/react';

export default function ImageRenderer({ imageSource = "default-image.jpg" }) {
  return (
    <Image
      src={imageSource}
      transformation={[{ width: 500, height: 500 }, { format: 'avif' }]}
      alt="Picture of the author"
    />
  )
}