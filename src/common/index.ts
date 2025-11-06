export  type AddressCreateResult = {
  address: string; // адрес, который можно найти в сети
  internalAddress?: string; // опционально, если сеть имеет внешний и внутренний адрес
  privateKey: string; // приватный ключ
  publicKey: string; // публичный ключ
};
export  type AddressKeyPair = {
  [address: string]: string; // объект, где ключ это адрес, а значение это приватный ключ
};
export  type AddressValidateResult = string | true;

export  type TxSignResult = {
  signedData: string; // подписанная транзакция
  txHash?: string; // опционально, hash транзакции
};
export  type TxValidateResult = boolean;
export  type BalanceByAddressResult = {
  balance: string; // баланс, который можно использовать, после фильтрации по utxoMinConfirmation, если актуально
  totalBalance: string; // баланс общий.
};
export  type GetBlockResult = Block;
export  type GetHeightResult = number;
export  type TxByHashResult = Transaction;
export  type Block = {
  height: number; // Высота блока
  timestamp: Date; // Время создания блока.
  transactions: Transaction[]; // Массив отформатированных транзакций.
  data: Record<string, unknown>; // Сырой ответ от ноды.
};
export  type Transaction = {
  hash: string; // hash транзакции
  ticker: string; // сокращенное название монеты или токена
  from: FromParams[]; // массив отправителей
  to: ToParams[]; // массив получателей
  status: TxStatus; // статус транзакции
  height?: number; // высота транзакции
  [key: string]: unknown; // доп. поля
};
export  type FromParams = {
  address: string; // адрес отправителя
  extraId?: string; // опционально, для "мемных" монет
  value: string | null; // сумма, значение без точек
};
export  type ToParams = {
  address: string; // адрес получателя
  extraId?: string;  // опционально, для "мемных" монет
  value: string; // сумма, значение без точек
};
export  type TransactionParams = {
  from: FromParams[] | FromParams; // массив отправителей
  to: ToParams[] | ToParams; // массив получателей
  fee?: NetworkFeeResponse; // объект с комиссией
  spent?: { // опционально, уже ранее потраченные utxo.
    [address: string]: string[]; // объект, где ключ это адрес, а значение это hash utxo в формате `${hash}|$[index}`
  };
  utxo?: { // опционально, использованные utxo в билде транзакции
    [address: string]: string[]; // объект, где ключ это адрес, а значение это hash utxo в формате `${hash}|$[index}`
  };
};

export type NetworkFeeResponse = {
  networkFee: number; // комиссия сети в числовом значение
  properties: Record<string, unknown>; // Дополнительно поле, если нужно использовать больше значений комиссии
}

export  type TransactionBroadcastParams = {
  signedData: string; // hex подписанной транзакции
};
export  type TransactionBroadcastResults = {
  hash: string; // hash транзакции
};
export  type NodesOptions = {
  [name: string]: { // условное обозначение провайдера
    url: string; // адрес провайдера
    headers?: { // объект заголовков, чаще всего используется для передачи авторизации
      [key: string]: string;
    };
    basic?: { // используется если требуется basic авторизация
      user: string;
      pass: string;
    };
    timeout?: number; // таймаут запросов к провайдеру
    confirmationLimit?: number; // кол-во блоков после которой транзакция считается finished
    [p: string]: unknown;
  };
};

// Тип адаптера
export enum AdapterType {
  Node = 'Node', // node
  BBook = 'BBook' // block book
}

// Статус транзакции
export enum TxStatus {
  'finished' = 'finished', // транзакция успешная и транзакция набрала нужное кол-во конфирмаций
  'failed' = 'failed', // транзакция завершилась ошибкой
  'unknown' = 'unknown', // для всего остального
}


export type GetBlocksResult = Block[];

export type GetBuildParams = Record<string, unknown>;

export type GetBuildParamsResult = Record<string, unknown>;

export type GetMempoolResult = Omit<Block, 'height'> & {
  size?: number;
};

export type TxBroadcastResult = TransactionBroadcastResults | {
  error: string;
};

export type UtxoByAddressResult = Record<string, unknown>[];

// Базовый класс для coin services
export abstract class BaseCoinService {
  abstract readonly network: string;
  public abstract nodes: BaseNodeAdapter[];
  public abstract blockBooks: BaseNodeAdapter[];

  public abstract initNodes(...args: unknown[]): void;

  public abstract addressCreate(ticker: string): Promise<AddressCreateResult>;

  public abstract addressValidate(ticker: string, address: string, privateKey: string, publicKey: string): Promise<AddressValidateResult>;

  public abstract txSign(ticker: string, privateKeys: AddressKeyPair, params: TransactionParams): Promise<TxSignResult>;

  public abstract txBuild(ticker: string, params: TransactionParams): Promise<TransactionParams>;
}

// базовый класс для node adapter
export abstract class BaseNodeAdapter {
  abstract readonly type: AdapterType;
  abstract readonly name: string;
  abstract readonly network: string;

  // public abstract utxoByAddress(ticker: string, address: string): Promise<UtxoByAddressResult>;
  // public abstract getBuildParams(params?: GetBuildParams): Promise<GetBuildParamsResult>;
  // public abstract getMempool(fromDate: number, chunkSize?: number, timeout?: number): Promise<GetMempoolResult>;

  public abstract txByHash(ticker: string, hash: string): Promise<TxByHashResult>;

  public abstract getHeight(): Promise<GetHeightResult>;

  public abstract getBlock(height: number): Promise<GetBlockResult>;

  public abstract balanceByAddress(ticker: string, address: string): Promise<BalanceByAddressResult>;

  public abstract txBroadcast(ticker: string, params: TransactionBroadcastParams): Promise<TxBroadcastResult>;

  protected abstract request<T, U>(method: 'POST' | 'GET' | 'PUT' | 'DELETE', url: string, data?: U, headers?: Record<string, string | number>): Promise<T>;
}