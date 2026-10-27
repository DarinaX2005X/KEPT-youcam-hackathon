import { notFound } from 'next/navigation';

// Development workbenches (/dev/ui, /dev/scan, …). /dev/scan can make paid YouCam calls,
// so none of them exist in a production build.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
