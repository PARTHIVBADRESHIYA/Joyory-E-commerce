import { nanoid } from 'nanoid';
export const generateShort = (len = 7) => nanoid(len);