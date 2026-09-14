import { io } from 'socket.io-client';
import { API_URL } from './api';

// One shared socket per browser tab, reused by whichever dashboard mounts.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}
