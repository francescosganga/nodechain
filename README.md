# Nodechain

### Motivation
Born from [Nodecoin](https://github.com/francescosganga/nodecoin)

### What is blockchain
[From Wikipedia](https://en.wikipedia.org/wiki/Blockchain): A blockchain, originally block chain, is a growing list of records, called blocks, which are linked using cryptography. Each block contains a cryptographic hash of the previous block, a timestamp, and transaction data.

### Key concepts of Nodecoin
* Components
    * HTTP Server
    * Node
    * Blockchain
    * Operator
    * Miner
* HTTP API interface to control everything
* Synchronization of blockchain and transactions
* Simple proof-of-work (The difficulty increases every 5 blocks)
* Addresses creation using a deterministic approach [EdDSA](https://en.wikipedia.org/wiki/EdDSA)
* Data is persisted to a folder

> Naivechain uses websocket for p2p communication, but it was dropped to simplify the understanding of message exchange. It is relying only on REST communication.

#### Components communication
![Components communication](doc/components.png)

Not all components in this implementation follow the complete list of requirements for a secure and scalable cryptocurrency. Inside the source-code, you can find comments with `INFO:` that describes what parts could be improved (and how) and what techniques were used to solve that specific challenge.

#### HTTP Server
Provides an API to manage the blockchain, wallets, addresses, transaction creation, mining request and peer connectivity.

It's the starting point to interact with the nodecoin, and every node provides a swagger API to make this interaction easier. Available endpoints:

##### Blockchain

|Method|URL|Description|
|------|---|-----------|
|GET|/blockchain/blocks|Get all blocks|
|GET|/blockchain/blocks/{index}|Get block by index|
|GET|/blockchain/blocks/{hash}|Get block by hash|
|GET|/blockchain/blocks/latest|Get the latest block|
|PUT|/blockchain/blocks/latest|Update the latest block|
|GET|/blockchain/blocks/transactions/{transactionId}|Get a transaction from some block|
|GET|/blockchain/transactions|Get unconfirmed transactions|
|POST|/blockchain/transactions|Create a transaction|
|GET|/blockchain/transactions/unspent|Get unspent transactions|

##### Node

|Method|URL|Description|
|------|---|-----------|
|GET|/node/peers|Get all peers connected to node|
|POST|/node/peers|Connects a new peer to node|
|GET|/node/transactions/{transactionId}/confirmations|Get how many confirmations a block has|

##### Miner

|Method|URL|Description|
|------|---|-----------|
|POST|/miner/mine|Mine a new block|

From the Swagger UI is possible to access a simple UI to visualize the blockchain and the unconfirmed transactions.

![UI](doc/ui.png)

#### Blockchain

The blockchain holds two pieces of information, the block list (a linked list), and the transaction list (a hash map). 

It's responsible for:
* Verification of arriving blocks;
* Verification of arriving transactions;
* Synchronization of the transaction list;
* Synchronization of the block list;

The blockchain is a linked list where the hash of the next block is calculated based on the hash of the previous block plus the data inside the block itself:

![Blockchain](doc/blockchain.png)

A block is added to the block list if:
1. The block is the last one (previous index + 1);
2. The previous block is correct (previous hash == block.previousHash);
3. The hash is correct (calculated block hash == block.hash);
4. The difficulty level of the proof-of-work challenge is correct (difficulty at blockchain index _n_ < block difficulty);
5. All data inside the block are valid;
6. Check if there is a double spending in that block
7. There is only 1 fee transaction and 1 reward transaction.

##### Block structure

A block represents a group of transactions and contains information that links it to the previous block.

```javascript
{ // Block
    "index": 0, // (first block: 0)
    "previousHash": "0", // (hash of previous block, first block is 0) (64 bytes)
    "timestamp": 1465154705, // number of seconds since January 1, 1970
    "nonce": 0, // nonce used to identify the proof-of-work step.
    "data": "string", // data
    "hash": "c4e0b8df46...199754d1ed" // hash taken from the contents of the block: sha256 (index + previousHash + timestamp + nonce + transactions) (64 bytes)
}
```

The details about the nonce and the proof-of-work algorithm used to generate the block will be described somewhere ahead.

#### Miner

The Miner gets the list of pending transactions and creates a new block containing the transactions. By configuration, every block has at most 2 transactions in it.

Assembling a new block:
1. From the list of unconfirmed transaction selected candidate transactions that are not already in the blockchain or is not already selected;
1. Get the first two transactions from the candidate list of transactions;
2. Add a new transaction containing the fee value to the miner's address, 1 satoshi per transaction;
3. Add a reward transaction containing 50 coins to the miner's address;
4. Prove work for this block;

##### Proof-of-work

The proof-of-work is done by calculating the 14 first hex values for a given transaction hash and increases the nonce until it reaches the minimal difficulty level required. The difficulty increases by an exponential value (power of 5) every 5 blocks created. Around the 70th block created it starts to spend around 50 seconds to generate a new block with this configuration. All these values can be tweaked.

```javascript
const difficulty = this.blockchain.getDifficulty();
do {
    block.timestamp = new Date().getTime() / 1000;
    block.nonce++;
    block.hash = block.toHash();
    blockDifficulty = block.getDifficulty();
} while (blockDifficulty >= difficulty);
```

The `this.blockchain.getDifficulty()` returns the hex value of the current blockchain's index difficulty. This value is calculated by powering the initial difficulty by 5 every 5 blocks.

The `block.getDifficulty()` returns the hex value of the first 14 bytes of block's hash and compares it to the currently accepted difficulty. 

When the hash generated reaches the desired difficulty level, it returns the block as it is.

#### Node

The node contains a list of connected peers and does all the data exchange between nodes, including:
1. Receive new peers and check what to do with it
1. Receive new blocks and check what to do with it
2. Receive new transactions and check what to do with it

The node rebroadcasts all information it receives unless it doesn't do anything with it, for example, if it already has the peer/transaction/blockchain.

An extra responsibility is to get a number of confirmations for a given transaction. It does that by asking every node if it has that transaction in its blockchain.

### Quick start

```sh
# Run a node
$ node bin/nodecoin.js

# Run two nodes
$ node bin/nodecoin.js -p 3001 --name 1
$ node bin/nodecoin.js -p 3002 --name 2 --peers http://localhost:3001

# Access the swagger API
http://localhost:3001/api-docs/
```

#### Example (wallet, address, transaction and mining)
```sh
# Create a wallet using password 't t t t t' (5 words)
$ curl -X POST --header 'Content-Type: application/json' -d '{ "password": "t t t t t" }' 'http://localhost:3001/operator/wallets'
{"id":"a2fb4d3f93ea3d4624243c03f507295c0c7cb5b78291a651e5575dcd03dfeeeb","addresses":[]}

# Create two addresses for the wallet created (replace walletId)
$ curl -X POST --header 'Content-Type: application/json' --header 'password: t t t t t' 'http://localhost:3001/operator/wallets/a2fb4d3f93ea3d4624243c03f507295c0c7cb5b78291a651e5575dcd03dfeeeb/addresses'
{"address":"e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"}

$ curl -X POST --header 'Content-Type: application/json' --header 'password: t t t t t' 'http://localhost:3001/operator/wallets/a2fb4d3f93ea3d4624243c03f507295c0c7cb5b78291a651e5575dcd03dfeeeb/addresses'
{"address":"c3c96504e432e35caa94c30034e70994663988ab80f94e4b526829c99958afa8"}

# Mine a block to the address 1 so we can have some coins
$ curl -X POST --header 'Content-Type: application/json' -d '{ "rewardAddress": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c" }' 'http://localhost:3001/miner/mine'
{
    "index": 1,
    "nonce": 1,
    "previousHash": "c4e0b8df46ce5cb2bcb0379ab0840228536cf4cd489783532a7c9d199754d1ed",
    "timestamp": 1493475731.692,
    "transactions": [
        {
            "id": "ab872b412afe62a087f3a8c354a27377f5fda33d7c98a1db3b1b0985801a6784",
            "hash": "423bae0bd2f4782f34c770df5be21f856b468a45bf88bb146da8ec2fe0fd3d21",
            "type": "reward",
            "data": {
                "inputs": [],
                "outputs": [
                    {
                        "amount": 5000000000,
                        "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"
                    }
                ]
            }
        }
    ],
    "hash": "0311a3a89198ccf888c76337cc190e2db238b67a7db0d5062aac97d14fb679b4"
}

# Create a transaction that transfer 1000000000 satoshis from address 1 to address 2
$ curl -X POST --header 'Content-Type: application/json' --header 'password: t t t t t' -d '{ "fromAddress": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c", "toAddress": "c3c96504e432e35caa94c30034e70994663988ab80f94e4b526829c99958afa8", "amount": 1000000000, "changeAddress": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c" }' 'http://localhost:3001/operator/wallets/a2fb4d3f93ea3d4624243c03f507295c0c7cb5b78291a651e5575dcd03dfeeeb/transactions'
 {
  "id": "c3c1e6fbff949042b065dc9e22d065a54ab826595fd8877d2be8ddb8cbb0e27f",
  "hash": "3b5bbf698031e437787fe7b31f098e214a1eeff01fee9b95c22bccf20146982c",
  "type": "regular",
  "data": {
    "inputs": [
      {
        "transaction": "ab872b412afe62a087f3a8c354a27377f5fda33d7c98a1db3b1b0985801a6784",
        "index": "0",
        "amount": 5000000000,
        "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c",
        "signature": "4500f432d6b400811d83364224ce62bccd042ad92299118c0672bc5bc1390ffdfdbef135f36927d8bd77843f3a0b868d9ed3a5346dcbeda6c06f33876cfae00d"
      }
    ],
    "outputs": [
      {
        "amount": 1000000000,
        "address": "c3c96504e432e35caa94c30034e70994663988ab80f94e4b526829c99958afa8"
      },
      {
        "amount": 3999999999,
        "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"
      }
    ]
  }
}

# Mine a new block containing that transaction
$ curl -X POST --header 'Content-Type: application/json' -d '{ "rewardAddress": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c" }' 'http://localhost:3001/miner/mine'
{
  "index": 2,
  "nonce": 6,
  "previousHash": "0311a3a89198ccf888c76337cc190e2db238b67a7db0d5062aac97d14fb679b4",
  "timestamp": 1493475953.226,
  "transactions": [
    {
      "id": "c3c1e6fbff949042b065dc9e22d065a54ab826595fd8877d2be8ddb8cbb0e27f",
      "hash": "3b5bbf698031e437787fe7b31f098e214a1eeff01fee9b95c22bccf20146982c",
      "type": "regular",
      "data": {
        "inputs": [
          {
            "transaction": "ab872b412afe62a087f3a8c354a27377f5fda33d7c98a1db3b1b0985801a6784",
            "index": "0",
            "amount": 5000000000,
            "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c",
            "signature": "4500f432d6b400811d83364224ce62bccd042ad92299118c0672bc5bc1390ffdfdbef135f36927d8bd77843f3a0b868d9ed3a5346dcbeda6c06f33876cfae00d"
          }
        ],
        "outputs": [
          {
            "amount": 1000000000,
            "address": "c3c96504e432e35caa94c30034e70994663988ab80f94e4b526829c99958afa8"
          },
          {
            "amount": 3999999999,
            "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"
          }
        ]
      }
    },
    {
      "id": "6b55b1e85369743f360edd5bedc3467eba81b35c2b88490686eee90946231dd6",
      "hash": "86f5b4a40c027e1ef7e060dd9b9ab7ae48258f3a43dfc19d9d8111c396463b8c",
      "type": "fee",
      "data": {
        "inputs": [],
        "outputs": [
          {
            "amount": 1,
            "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"
          }
        ]
      }
    },
    {
      "id": "0f6f6c04602ac1bea15157a1a86978d46488a7865fa3db3bfc581a1407950599",
      "hash": "f9fa281fbf9ffd3d63dd0c3503588fe3010dd6740a4a960b98d1be4aa1fa7a05",
      "type": "reward",
      "data": {
        "inputs": [],
        "outputs": [
          {
            "amount": 5000000000,
            "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"
          }
        ]
      }
    }
  ],
  "hash": "08861fc4864ba0bf7a899db9ffaaa39376ad3857b1115951db074e3d06f93a5f"
}

# Check how many confirmations that transaction has.
$ curl -X GET --header 'Content-Type: application/json' 'http://localhost:3001/node/transactions/c3c1e6fbff949042b065dc9e22d065a54ab826595fd8877d2be8ddb8cbb0e27f/confirmations'
{"confirmations":1}

# Get address 1 balance
$ curl -X GET --header 'Content-Type: application/json' 'http://localhost:3001/operator/e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c/balance'
{"balance":9000000000}

# Get address 2 balance
$ curl -X GET --header 'Content-Type: application/json' 'http://localhost:3001/operator/c574de33acfd82f2146d2f45f37ce95b7bdca133b8ad310adbd46938c75992c8/balance'
{"balance":1000000000}

# Get unspent transactions for address 1
$ curl -X GET --header 'Content-Type: application/json' 'http://localhost:3001/blockchain/transactions/unspent?address=e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c'
[
  {
    "transaction": "c3c1e6fbff949042b065dc9e22d065a54ab826595fd8877d2be8ddb8cbb0e27f",
    "index": "1",
    "amount": 3999999999,
    "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"
  },
  {
    "transaction": "6b55b1e85369743f360edd5bedc3467eba81b35c2b88490686eee90946231dd6",
    "index": "0",
    "amount": 1,
    "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"
  },
  {
    "transaction": "0f6f6c04602ac1bea15157a1a86978d46488a7865fa3db3bfc581a1407950599",
    "index": "0",
    "amount": 5000000000,
    "address": "e155df3a1bac05f88321b73931b48b54ea4300be9d1225e0b62638f537e5544c"
  }
]
```

### Client

```sh
# Command-line options
$ node bin/nodecoin.js -h
Usage: bin\nodecoin.js [options]

Options:
  -a, --host       Host address. (localhost by default)
  -p, --port       HTTP port. (3001 by default)
  -l, --log-level  Log level (7=dir, debug, time and trace, 6=log and info,
                   4=warn, 3=error, assert, 6 by default).
  --peers          Peers list.                                           [array]
  --name           Node name/identifier.
  -h, --help       Show help                                           [boolean]
```

### Development

```sh
# Cloning repository
$ git clone git@github.com:conradoqg/nodecoin.git
$ cd nodecoin
$ npm install

# Testing
$ npm test
```

### Contribution and License Agreement

If this implementation does something wrong, please feel free to contribute by opening an issue or sending a PR. The main goal of this project is not to create a full-featured cryptocurrency, but a good example of how it works.

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the Apache 2.0 license. You are also implicitly verifying that
all code is your original work.

[![Twitter](https://img.shields.io/twitter/url/https/github.com/conradoqg/nodecoin.svg?style=social)](https://twitter.com/intent/tweet?text=Check%20it%20out%3A%20Nodecoin%20-%20a%20cryptocurrency%20implementation%20in%20less%20than%201500%20lines%20of%20code&url=%5Bobject%20Object%5D)

[![GitHub license](https://img.shields.io/badge/license-Apache%202-blue.svg)](https://raw.githubusercontent.com/conradoqg/nodecoin/master/LICENSE)
