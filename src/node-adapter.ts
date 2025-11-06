import {
  AdapterType,
  BalanceByAddressResult,
  BaseNodeAdapter,
  GetBlockResult,
  GetHeightResult,
  TxByHashResult,
} from './common';
import { XxxTransactionBroadcastParams, XxxTransactionBroadcastResults } from './types';

/**
 * Класс, который инициализируется в XxxCoinService для выполнения сетевых запросов.
 *
 * Вместо ХХХ указываем тикер.
 * BaseNodeAdapter - это базовый класс который определяет все методы и их типы.
 * @param network - короткое название сети.
 * @param name - Название провайдера, под которого пишется адаптер (NowNodes, GetBlock, Ankr  и тд).
 * @param confirmationLimit - Количество конфирмаций, число блоков которое отсчитывается после транзакции, чтобы считать ее завершенной.
 * @param utxoConfirmationLimit - Опциональное значение, используется только для сетей с utxo. Количество конфирмаций для utxo, число блоков которое отсчитывается после транзакции, чтобы считать ее завершенной.
 */
export class XxxNodeAdapter extends BaseNodeAdapter {
  constructor(
    readonly network: string,
    readonly name: string = 'NN',
    readonly url: string,
    readonly confirmationLimit: number,
    readonly utxoConfirmationLimit?: number,
    readonly type = AdapterType.Node,
  ) {
    super();
  }

  /**
   * Функция, которая возвращается отформатированные данных по hash'у транзакции и тикеру.
   *
   * Стандартная реализация подразумевает сетевой запрос в сеть по hash'у и получение сырых данных из сети. Которые потом форматируются под ответ.
   * 1. Валидация по методу. В данной реализации поддерживаем только дефолтный метод трансфера. От сети к сети этот метод может отличаться, он может быть как дефолтный и заложен сетью, так и выполняться через специализированный контракт.
   * 2. Валидация по тикеру. Транзакции могут быть как токеновые, так и с нативной монетой. В данное реализации интересуют только транзакции нативной монеты.
   * 3. Валидация по статусу.
   *
   * Рекомендуется сделать дополнительный метод "processTransaction" который будет форматировать сырую транзакцию (не приведенную к общему типу) к формату который требуется на выходе TxByHashResult.
   * Если транзакция является batch-транзакцией (одна транзакция, где средства поступают на несколько адресов), то их необходимо разделить на разные транзакции с одним hash'ом.
   *
   * В случая если сеть не btc-like (нет utxo) и processTransaction вернул массив транзакций, то необходимо взять только первую транзакцию. Так как этот метод, в основном, важен только для получения статуса транзакции.
   */
  async txByHash(
    ticker: string,
    hash: string,
  ): Promise<TxByHashResult> {
    return null;
  }

  /**
   * Функция запроса высоты блокчейна.
   */
  async getHeight(): Promise<GetHeightResult> {
    return null;
  }

  /**
   * Функция запроса блока и транзакций которые в этом блоке находятся по его высоте.
   */
  async getBlock(
    height: number,
  ): Promise<GetBlockResult> {
    return null;
  }

  /**
   * Функция запроса баланса по адресу и тикеру.
   */
  async balanceByAddress(
    ticker: string,
    address: string,
  ): Promise<BalanceByAddressResult> {
    return null;
  }

  /**
   * Функция отправки в сеть подписанной транзакции.
   */
  async txBroadcast(
    ticker: string,
    params: XxxTransactionBroadcastParams,
  ): Promise<XxxTransactionBroadcastResults | { error: string }> {
    return null;
  }

  /**
   * Функция-обертка для выполнения сетевого запроса.
   */
  protected request<T, U>(method: 'POST' | 'GET' | 'PUT' | 'DELETE', url: string, data?: U, headers?: Record<string, string | number>): Promise<T> {
    return null;
  }
}
