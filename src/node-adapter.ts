import axios from "axios";
import {
  AdapterType,
  BalanceByAddressResult,
  BaseNodeAdapter,
  FromParams,
  GetBlockResult,
  GetHeightResult,
  ToParams,
  TxByHashResult,
  TxStatus,
  Transaction,
} from './common';
import {HBARTransactionBroadcastParams, HBARTransactionBroadcastResults} from './types';
import {safeLog} from "./utils/safeLogger";

/**
 * Класс, который инициализируется в HBARCoinService для выполнения сетевых запросов.
 *
 * Вместо ХХХ указываем тикер.
 * BaseNodeAdapter - это базовый класс который определяет все методы и их типы.
 * @param network - короткое название сети.
 * @param name - Название провайдера, под которого пишется адаптер (NowNodes, GetBlock, Ankr  и тд).
 * @param confirmationLimit - Количество конфирмаций, число блоков которое отсчитывается после транзакции, чтобы считать ее завершенной.
 * @param utxoConfirmationLimit - Опциональное значение, используется только для сетей с utxo. Количество конфирмаций для utxo, число блоков которое отсчитывается после транзакции, чтобы считать ее завершенной.
 */
export class HBARNodeAdapter extends BaseNodeAdapter {
  constructor(
    readonly network: string,
    readonly name: string = 'QuickNode',
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
    try {
      await safeLog("info", "Fetching Hedera tx from API", { ticker, hash });

      // Mirror Node API возвращает список транзакций по id
      const response = await axios.get(`${this.url}/api/v1/transactions/${hash}`);

      if (!response.data?.transactions?.length) {
        const reason = "Transaction not found";
        await safeLog("error", "txByHash failed", { ticker, hash, reason });
        throw new Error(reason);
      }

      const rawTx = response.data.transactions[0];
      const transfers = rawTx?.transfers || [];

      const from: FromParams[] = transfers
          .filter((t: any) => t.amount < 0)
          .map((t: any) => ({
            address: t.account,
            value: Math.abs(t.amount).toString(),
          }));

      const to: ToParams[] = transfers
          .filter((t: any) => t.amount > 0)
          .map((t: any) => ({
            address: t.account,
            value: t.amount.toString(),
          }));

      const status: TxStatus =
          rawTx.result === "SUCCESS" ? TxStatus.finished :
              rawTx.result === "PENDING" ? TxStatus.unknown : TxStatus.failed;

      const transaction: Transaction = {
        hash,
        ticker,
        from,
        to,
        status,
        height: rawTx.consensus_timestamp
            ? Number(rawTx.consensus_timestamp.split(".")[0])
            : undefined,
      };

      await safeLog("info", "Transaction parsed successfully", { ticker, hash, status });

      return transaction;
    } catch (error) {
      await safeLog("error", "txByHash failed", {
        ticker,
        hash,
        reason: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Функция запроса высоты блокчейна.
   */
  async getHeight(): Promise<GetHeightResult> {
    try {
      const url = `${this.url}/api/v1/blocks?limit=1&order=desc`;
      const response = await axios.get(url);

      if (!response.data || !response.data.blocks?.length) {
        throw new Error("Некорректный ответ от узла HBAR");
      }

      const height = response.data.blocks[0].number ?? response.data.blocks[0].index;

      await safeLog("info", "Fetched blockchain height", { height, network: this.network });
      return height;
    } catch (error: any) {
      await safeLog("error", "Failed to fetch blockchain height", {
        network: this.network,
        reason: error.message,
      });

      throw new Error(`Ошибка при получении высоты сети: ${error.message}`);
    }
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
    params: HBARTransactionBroadcastParams,
  ): Promise<HBARTransactionBroadcastResults | { error: string }> {
    return null;
  }

  /**
   * Функция-обертка для выполнения сетевого запроса.
   */
  protected request<T, U>(method: 'POST' | 'GET' | 'PUT' | 'DELETE', url: string, data?: U, headers?: Record<string, string | number>): Promise<T> {
    return null;
  }
}
