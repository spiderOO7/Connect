'use client';

import VideoCall from '@/components/VideoCall';
import AuthGuard from '@/components/AuthGuard';
import { useParams } from 'next/navigation';

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  return (
    <AuthGuard>
      <VideoCall roomId={roomId} />
    </AuthGuard>
  );
}
