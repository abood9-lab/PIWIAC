import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = () => socket;

export const initSocket = (token: string) => {
  if (!socket) {
    socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
