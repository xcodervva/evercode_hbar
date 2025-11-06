import {
  AddressCreateResult,
  AddressKeyPair,
  AddressValidateResult,
  BaseCoinService,
  BaseNodeAdapter,
  NodesOptions,
  TxSignResult,
} from './common';
import { XxxNodeAdapter } from './node-adapter';
import { XxxTransactionParams } from './types';


/**
 * Основной класс для все монеты.
 * Вместо ХХХ указываем тикер.
 * BaseCoinService - это базовый класс который определяет все методы и их типы.
 */
export class XxxCoinService extends BaseCoinService {
  public nodes: BaseNodeAdapter[] = [];
  public blockBooks: BaseNodeAdapter[] = [];
  public readonly network = 'XXX';
  protected mainNodeAdapter = XxxNodeAdapter;

  /**
   * Инициализация провайдера(ов).
   */
  initNodes(
    nodes: NodesOptions,
  ): void {
    this.nodes = Object.entries(nodes).map(([name, opts]) => {
      const url: string = opts.url;
      let headers: Array<{ name: string; value: string }>;

      if (opts.headers) {
        if (!headers?.length) {
          headers = [];
        }

        Object.entries(opts.headers).forEach(([name, value]) => {
          headers.push({ name, value });
        });
      }

      return new this.mainNodeAdapter(
        this.network,
        name,
        url,
        opts.confirmationLimit,
      );
    });
  }

  /**
   * Функция создания адреса.
   *
   * Генерация обычно состоит из нескольких пунктов
   * 1. Генерация случайного значения. Чаще всего используется `Buffer.from(crypto.randomBytes(32)`.
   * 2. Из случайного значения генерируется приватный ключ (privateKey).
   * 3. Из приватного ключа генерируется публичный ключ (publicKey).
   * 4. Из публичного ключа генерируется адрес.
   */
  async addressCreate(
    ticker: string,
  ): Promise<AddressCreateResult> {
    return null;
  }

  /**
   * Функция валидации адреса.
   *
   * Проверяем адрес по разным шаблонам (длинна, символы, чек-сумма и тд.) Для разных сетей условия будут разные в зависимости от формата адресов.
   * В случае если адрес не прошел проверку не нужно генерировать ошибку, а нужно вернуть строку с описание какую проверку он не прошел.
   * В случае если пройдены все проверки возвращаем `true`.
   */
  async addressValidate(
    ticker: string,
    address: string,
    privateKey: string,
    publicKey: string,
  ): Promise<AddressValidateResult> {
    return null;
  }

  /**
   * Функция подписи транзакции.
   *
   * Подпись транзакции необходима для того чтобы подтвердить что действительно владелец счета хочет перевести средства с этого адреса. Для подписи используется приватник.
   * Объект на подпись приходит такой который вы вернули в функции txBuild.
   */
  async txSign(
    ticker: string,
    privateKeys: AddressKeyPair,
    params: XxxTransactionParams,
  ): Promise<TxSignResult> {
    return null;
  }

  /**
   * Функция сборки транзакции.
   *
   * Билд транзакции — это сборки из исходного запроса `params` объекта адаптированного под сеть, которую остается только подписать.
   * Обычно флоу это функции следующее:
   * - проверка входящий данных (валидация);
   * - запрос необходимых сетевых данных (utxo/customNonce/height);
   * - приведение объекта к формату сети.
   */
  async txBuild(
    ticker: string,
    params: XxxTransactionParams,
  ): Promise<XxxTransactionParams> {
    return null;
  }
}
