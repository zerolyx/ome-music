declare module "qrcode" {
  interface QrCodeOptions {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  interface QrCodeApi {
    toDataURL(text: string, options?: QrCodeOptions): Promise<string>;
  }

  const QRCode: QrCodeApi;
  export default QRCode;
}
