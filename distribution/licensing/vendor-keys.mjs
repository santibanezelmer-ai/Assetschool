import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Genera o carga el par de claves raíz del Vendor (AssetSchool Inc.)
 * En producción, la clave privada se resguarda en el HSM del vendor.
 * La clave pública se embebe de forma inmutable en el runtime de la aplicación.
 */
export function getOrCreateVendorKeyPair(keysDir) {
  const pubPath = path.resolve(keysDir, 'assetschool-vendor.pub.pem');
  const privPath = path.resolve(keysDir, 'assetschool-vendor.priv.pem');

  if (fs.existsSync(pubPath) && fs.existsSync(privPath)) {
    return {
      publicKeyPem: fs.readFileSync(pubPath, 'utf8'),
      privateKeyPem: fs.readFileSync(privPath, 'utf8'),
    };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.mkdirSync(keysDir, { recursive: true });
  fs.writeFileSync(pubPath, publicKey, 'utf8');
  fs.writeFileSync(privPath, privateKey, 'utf8');

  return {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
  };
}
