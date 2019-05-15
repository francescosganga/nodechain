const EventEmitter = require('events');
const R = require('ramda');
const Db = require('../util/db');
const Blocks = require('./blocks');
const Block = require('./block');
const BlockAssertionError = require('./blockAssertionError');
const BlockchainAssertionError = require('./blockchainAssertionError');
const Config = require('../config');

// Database settings
const BLOCKCHAIN_FILE = 'blocks.json';

class Blockchain {
    constructor(dbName) {
        this.blocksDb = new Db('data/' + dbName + '/' + BLOCKCHAIN_FILE, new Blocks());

        // INFO: In this implementation the database is a file and every time data is saved it rewrites the file, probably it should be a more robust database for performance reasons
        this.blocks = this.blocksDb.read(Blocks);

        // Some places uses the emitter to act after some data is changed
        this.emitter = new EventEmitter();
        this.init();
    }

    init() {
        // Create the genesis block if the blockchain is empty
        if (this.blocks.length == 0) {
            console.info('Blockchain empty, adding genesis block');
            this.blocks.push(Block.genesis);
            this.blocksDb.write(this.blocks);
        }
    }

    getAllBlocks() {
        return this.blocks;
    }

    getBlockByIndex(index) {
        return R.find(R.propEq('index', index), this.blocks);
    }

    getBlockByHash(hash) {
        return R.find(R.propEq('hash', hash), this.blocks);
    }

    getLastBlock() {
        return R.last(this.blocks);
    }

    getTransactionById(id) {
        return R.find(R.propEq('id', id), this.transactions);
    }

    replaceChain(newBlockchain) {
        // It doesn't make sense to replace this blockchain by a smaller one
        if (newBlockchain.length <= this.blocks.length) {
            console.error('Blockchain shorter than the current blockchain');
            throw new BlockchainAssertionError('Blockchain shorter than the current blockchain');
        }

        // Verify if the new blockchain is correct
        this.checkChain(newBlockchain);

        // Get the blocks that diverges from our blockchain
        console.info('Received blockchain is valid. Replacing current blockchain with received blockchain');
        let newBlocks = R.takeLast(newBlockchain.length - this.blocks.length, newBlockchain);

        // Add each new block to the blockchain
        R.forEach((block) => {
            this.addBlock(block, false);
        }, newBlocks);

        this.emitter.emit('blockchainReplaced', newBlocks);
    }

    checkChain(blockchainToValidate) {
        // Check if the genesis block is the same
        if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(Block.genesis)) {
            console.error('Genesis blocks aren\'t the same');
            throw new BlockchainAssertionError('Genesis blocks aren\'t the same');
        }

        // Compare every block to the previous one (it skips the first one, because it was verified before)
        try {
            for (let i = 1; i < blockchainToValidate.length; i++) {
                this.checkBlock(blockchainToValidate[i], blockchainToValidate[i - 1], blockchainToValidate);
            }
        } catch (ex) {
            console.error('Invalid block sequence');
            throw new BlockchainAssertionError('Invalid block sequence', null, ex);
        }
        return true;
    }

    addBlock(newBlock, emit = true) {
        // It only adds the block if it's valid (we need to compare to the previous one)
        if (this.checkBlock(newBlock, this.getLastBlock())) {
            this.blocks.push(newBlock);
            this.blocksDb.write(this.blocks);

            console.info(`Block added: ${newBlock.hash}`);
            console.debug(`Block added: ${JSON.stringify(newBlock)}`);
            if (emit) this.emitter.emit('blockAdded', newBlock);

            return newBlock;
        }
    }

    checkBlock(newBlock, previousBlock, referenceBlockchain = this.blocks) {
        const blockHash = newBlock.toHash();

        if (previousBlock.index + 1 !== newBlock.index) { // Check if the block is the last one
            console.error(`Invalid index: expected '${previousBlock.index + 1}' got '${newBlock.index}'`);
            throw new BlockAssertionError(`Invalid index: expected '${previousBlock.index + 1}' got '${newBlock.index}'`);
        } else if (previousBlock.hash !== newBlock.previousHash) { // Check if the previous block is correct
            console.error(`Invalid previoushash: expected '${previousBlock.hash}' got '${newBlock.previousHash}'`);
            throw new BlockAssertionError(`Invalid previoushash: expected '${previousBlock.hash}' got '${newBlock.previousHash}'`);
        } else if (blockHash !== newBlock.hash) { // Check if the hash is correct
            console.error(`Invalid hash: expected '${blockHash}' got '${newBlock.hash}'`);
            throw new BlockAssertionError(`Invalid hash: expected '${blockHash}' got '${newBlock.hash}'`);
        } else if (newBlock.getDifficulty() >= this.getDifficulty(newBlock.index)) { // If the difficulty level of the proof-of-work challenge is correct
            console.error(`Invalid proof-of-work difficulty: expected '${newBlock.getDifficulty()}' to be smaller than '${this.getDifficulty(newBlock.index)}'`);
            throw new BlockAssertionError(`Invalid proof-of-work difficulty: expected '${newBlock.getDifficulty()}' be smaller than '${this.getDifficulty()}'`);
        }

        return true;
    }

    getDifficulty(index) {        
        // Calculates the difficulty based on the index since the difficulty value increases every X blocks.
        return Config.pow.getDifficulty(this.blocks, index);        
    }
}

module.exports = Blockchain;
