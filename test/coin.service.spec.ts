import { isAddress } from "ethers";
import { HBARCoinService } from '../src/coin.service';

describe('address creation', () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
  });

  it('creates unpredictable address', async () => {
    const ticker = service.network;

    const result1 = await service.addressCreate(ticker);
    const result2 = await service.addressCreate(ticker);

    // 1. Проверяем, что структура данных корректна
    expect(result1).toHaveProperty("address");
    expect(result1).toHaveProperty("privateKey");
    expect(result1).toHaveProperty("publicKey");

    // 2. Проверяем, что адрес корректен по формату
    expect(isAddress(result1.address)).toBe(true);
    expect(isAddress(result2.address)).toBe(true);

    // 3. Проверяем, что адреса и ключи разные (непредсказуемость)
    expect(result1.address).not.toEqual(result2.address);
    expect(result1.privateKey).not.toEqual(result2.privateKey);
    expect(result1.publicKey).not.toEqual(result2.publicKey);

    // 4. Проверяем, что приватный ключ начинается с '0x'
    expect(result1.privateKey.startsWith("0x")).toBe(true);
  });

  it('creates known address', async () => {

  });
});

describe('address validation', () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
  });

  it('validate correct addresses', async () => {
    const { address, privateKey, publicKey } = await service.addressCreate(service.network);
    const result = await service.addressValidate(service.network, address, privateKey, publicKey);
    expect(result).toBe(true);
  });

  it('return error messages on corresponding errors', async () => {
    const res = await service.addressValidate(service.network, "0x12345", "0xabc", "0xdef");
    expect(typeof res).toBe("string");
    expect(res).toContain("Неверный формат адреса");
  });
});

describe('transaction build', () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
  });

  it('build transaction', async () => {

  });

  it('build errors', async () => {

  });
});

describe('transaction sign', () => {
  let service: HBARCoinService;

  beforeAll(() => {
    service = new HBARCoinService();
  });

  it('signs', async () => {

  });
});
