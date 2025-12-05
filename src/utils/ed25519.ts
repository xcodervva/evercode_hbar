import { generateKeyPairSync } from "crypto";

export interface Ed25519KeyPair {
    privateKeyRaw: Uint8Array; // 32 bytes
    publicKeyRaw: Uint8Array;  // 32 bytes
}

/**
 * Генерация ED25519 ключей без сторонних библиотек
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");

    // Извлекаем сырые ключи в DER → raw
    const privateDer = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
    const publicDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;

    // Формат PKCS8/DER фиксирован, raw ключи всегда в конце
    const privateKeyRaw = privateDer.slice(-32); // последние 32 байта
    const publicKeyRaw = publicDer.slice(-32);   // последние 32 байта

    return {
        privateKeyRaw,
        publicKeyRaw,
    };
}
