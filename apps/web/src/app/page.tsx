import { redirect } from 'next/navigation';

// The root sends users into the app. Unauthenticated visitors never reach the
// redirect — the edge middleware bounces them to /login first.
export default function HomePage() {
  redirect('/dashboard');
}
