import Web3 from 'web3';
import { Tx, helpers } from 'leap-core';

const web3 = helpers.extendWeb3(new Web3('http://localhost:8645'));


const utxo = await web3.getUnspent(accountAddr);
