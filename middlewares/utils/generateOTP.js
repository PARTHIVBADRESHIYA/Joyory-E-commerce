// utils/generateOTP.js
export const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
};