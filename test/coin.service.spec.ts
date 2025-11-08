import { isAddress, Wallet, HDNodeWallet, Mnemonic } from "ethers";
import { HBARCoinService } from '../src/coin.service';
import * as safeLogger from "../src/utils/safeLogger";

// Мокаем safeLog, чтобы не происходило реальное логирование
jest.mock("../src/utils/safeLogger", () => ({
  safeLog: jest.fn(),
}));

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

    // 5. Проверяем, что safeLog вызван
    expect(safeLogger.safeLog).toHaveBeenCalledWith(
        "info",
        "Created new wallet address",
        expect.objectContaining({
          ticker,
          address: expect.any(String),
          privateKey: expect.any(String),
        }),
    );
  });

  it('creates known address', async () => {
    // Детерминированные данные
    const mnemonic = Mnemonic.fromPhrase(
        "test test test test test test test test test test test junk"
    );
    const knownWallet = HDNodeWallet.fromMnemonic(mnemonic);
    const expectedAddress = knownWallet.address;

    // Мокаем createRandom, возвращая HDNodeWallet
    const spy = jest
        .spyOn(Wallet, "createRandom")
        .mockReturnValue(knownWallet as any);

    const result = await service.addressCreate(service.network);

    expect(result.address).toBe(expectedAddress);
    expect(result.privateKey).toBe(knownWallet.privateKey);

    spy.mockRestore();
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
