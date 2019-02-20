
/**
 * Copyright (c) 2018-present, Leap DAO (leapdao.org)
 *
 * This source code is licensed under the GNU Affero General Public License,
 * version 3, found in the LICENSE file in the root directory of this source
 * tree.
 */

import { bufferToHex } from 'ethereumjs-util';
import { BigInt, add, subtract, greaterThan, greaterThanOrEqual, lessThan, equal } from 'jsbi-utils';
import Outpoint from './outpoint';
import Input from './input';
import Output from './output';
import Period from './period';
import Tx from './transaction';

import { BLOCKS_PER_PERIOD } from './constants';
import { notEqual } from 'assert';

export function extendWeb3(web3Instance) {
  // `_extend` for web3 0.2x.x, `extend` for 1.x
  const extend = web3Instance._extend || web3Instance.extend; // eslint-disable-line no-underscore-dangle, max-len
  extend({
    methods: [
      new extend.Method({
        name: 'getUnspent',
        call: 'plasma_unspent',
        params: 1,
        inputFormatters: [
          extend.formatters.inputAddressFormatter, // account address
        ],
        outputFormatter: (unspent) => {
          if (Array.isArray(unspent)) {
            // web3 0.2x.x passes in an array
            return unspent.map((u) => ({
                output: u.output,
                outpoint: Outpoint.fromRaw(u.outpoint),
            }));
          }
          return {
            output: unspent.output,
            outpoint: Outpoint.fromRaw(unspent.outpoint),
          }
        },
      }),
      new extend.Method({
        name: 'getColor',
        call: 'plasma_getColor',
        params: 1,
        inputFormatters: [
          extend.formatters.inputAddressFormatter, // token contract address
        ],
        outputFormatter: Number,
      }),
      new extend.Method({
        name: 'getColors',
        call: 'plasma_getColors',
        params: 0,
        inputFormatters: [],
        outputFormatter: String,
      }),
      new extend.Method({
        name: 'status',
        call: 'plasma_status',
        params: 0,
        inputFormatters: [],
        outputFormatter: String,
      }),
      new extend.Method({
        name: 'getConfig',
        call: 'plasma_getConfig',
        params: 0,
        inputFormatters: [],
        outputFormatter: a => a,
      }),
      new extend.Method({
        name: 'getValidatorInfo',
        call: 'validator_getAddress',
        params: 0,
        inputFormatters: [],
        outputFormatter: a => a,
      }),
    ],
  });
  return web3Instance;
}

//Cryptonian
// unspent : 플라즈마 체인 상에서 from 주소가 소유한 토큰 전체 리스트
// from : 소유자 주소
// to : 소유자가 컨트롤 하기 원하는 IoT 기기의 주소 (TBD)
// newPolicy : Read/Write/Execute 각각의 Flag
// color : Non-Fungible Storage Token 의 Color ID 
export function formSCInputs(unspent, from, tokenId, to, policy, color) {

  const myUnspent = unspent.filter(
    ({output}) =>
      output.color === color &&
      output.address.toLowerCase() === from.toLowerCase(),
  );
  //console.log(BigInt(tokenId));
  //console.log(BigInt(myUnspent[0].output.value));

  const exact = myUnspent.find(utxo => equal(BigInt(utxo.output.value), BigInt(tokenId)));
  
  if (!exact) throw new Error("No Matched UTXO with tokenId");
  return [new Input({  // input.js의 생성자를 참고하라..
    prevout: exact.outpoint,
    gasPrice: 12345, // ??? 왜 GasPrice 가 필요한가? [Self-Ans:script(Param:msgData)를 실행하기 위한 GasPrice임..]
    msgData: to,
    script: policy,
  })];

  /*
  const myUnspent = unspent.filter(
    ({output}) => 
      output.color === color &&                             // 변경하고자 하는 State 가 담긴 토큰(NST)의 color ID
      output.address.toLowerCase() === from.toLowerCase(),  // 토큰 소유자 체크
  );

  const exact = myUnspent.find(utxo => equal(BigInt(utxo.output.value), BigInt(to)));
  if (!exact) {
    throw new Error('No matched Token..')
  }
  // Dummy Code..
  // const inputBuf = Buffer.from('0d000000000754d4ec11777777777777777777777777777777777777777777777777777777777777777700111111110001aa0002bbbb', 'hex');
  // hash : `0x${intputBuf.slice(10,42).toString('hex')`}

  // TBD
  // 원래 output의 value 값을 string 등으로 가져가야하나.. 현 버전의 output에서는 BigInt만 지원하는 중..
  // Output.value 에는 IoT 기기의 주소값이 들어있는 것으로??!! BigInt Type..
    
  return [new Input({
    hash : exact.outpoint, 
    index : 0,
    gasPrice : 5141349,
    msgData : `0x${to.toLowerCase()}`,   // 1. TBD 추후 수정. output 구조체 변경을 최소화 하다보니.. output에서 value 이외의 Data 지원해야..
                    // 2. output.value 와 상관없이 to를 msgData에.. script를 newPolicy에 적용해도 괜찮다?!
                    // 원래 Spending Codition에서는 script가 실행해야하는 함수, msgData 가 그 파라미터들
    script :  `0x${newPolicy}`,          // TBD 수정
  })];
  */

}

export function calcInputs(unspent, from, amount, color) {
  const myUnspent = unspent.filter(
    ({ output }) =>
      output.color === color &&
      output.address.toLowerCase() === from.toLowerCase(),
  );

  const exact = myUnspent.find(utxo => equal(BigInt(utxo.output.value), BigInt(amount)));

  if (exact) return [new Input(exact.outpoint)];

  const inputs = [];
  let sum = BigInt(0);
  for (let i = 0; i < myUnspent.length; i += 1) {
    inputs.push(new Input(myUnspent[i].outpoint));
    sum = add(sum, BigInt(myUnspent[i].output.value));

    if (greaterThanOrEqual(sum, BigInt(amount))) {
      break;
    }
  }

  if (lessThan(sum, BigInt(amount))) {
    throw new Error('Not enough inputs');
  }

  return inputs;
}

// Cryptonian
export function formSCOutputs(inputs, owner, tokenId, color) {
  if (inputs.length === 0) {
    throw new Error ('Unspent is Empty');
  }
  const outputs = [];
  for (let i = 0; i < inputs.length; i += 1) {
    var output = new Output(tokenId, owner.toLowerCase(), color);
    // 원래는 이부분에 Input 에서 넘어온 script (param:msgData)를 EVM 상에서 실행시켜 storageRoot 까지 계산해야한다.
    output.storageRoot = JSON.stringify({"script":inputs[i].script,"msgData":inputs[i].msgData});

    outputs.push(output);
  }

  // ?? - output의 생성자 (valueOrObject, address, color)
  // Token Transfer 의 경우 토큰량, 주소, Color 로 이뤄짐..
//  const outputs = [new Output(tokenId, owner.toLowerCase(), color)];

  return outputs;
}


// ToDo: handle inputs from different accounts
// ToDo: handle different input colors
export function calcOutputs(unspent, inputs, from, to, amount, color) {
  if (unspent.length === 0) {
    throw new Error('Unspent is empty');
  }

  const inInputs = u => inputs.findIndex(input => u.outpoint.equals(input.prevout)) > -1;
  const sum = unspent.filter(inInputs).reduce((a, u) => add(a, BigInt(u.output.value)), BigInt(0));

  if (lessThan(sum, BigInt(amount))) {
    throw new Error('Not enough inputs');
  }

  const outputs = [new Output(amount, to.toLowerCase(), color)];
  if (greaterThan(sum, BigInt(amount))) {
    outputs.push(new Output(subtract(sum, BigInt(amount)), from.toLowerCase(), color));
  }

  return outputs;
}

/**
 * Returns the block number interval for the period given block is included to.
 *
 * @param {Number} blockNumber block height of the block we are getting period block range for
 * @returns {Array} block interval in [startBlock: number, endBlock: number] format
 */
export function periodBlockRange(blockNumber) {
  const periodNum = Math.floor(blockNumber / BLOCKS_PER_PERIOD);
  return [
    periodNum * BLOCKS_PER_PERIOD,
    (periodNum + 1) * BLOCKS_PER_PERIOD - 1,
  ];
}

/**
 * Finds the youngest tx in a given array.
 *
 * Youngest tx is the one with biggest block number.
 * @param {LeapTransaction[]} txs
 * @returns {InputTx} youngest tx and its index
 */
export function getTxWithYoungestBlock(txs) {
  return txs.reduce((res, tx, i) => {
    if (tx.blockNumber > res.tx.blockNumber) {
      res.index = i;
      res.tx = tx;
    }
    return res;
  }, { index: 0, tx: txs[0] });
}

/**
 * Returns the youngest input for a given tx.
 *
 * Youngest input is the one which references tx with biggest block number.
 * @param {ExtendedWeb3} plasma instance of Leap Web3
 * @param {Tx} tx
 * @returns {Promise<InputTx>} promise that resolves to youngest input tx and its index
 */
export function getYoungestInputTx(plasma, tx) {
  return Promise.all(tx.inputs.map(i =>
    plasma.eth.getTransaction(bufferToHex(i.prevout.hash)),
  )).then(getTxWithYoungestBlock);
}

/**
 * Creates proof of period inclusion for a given tx
 *
 * @param {ExtendedWeb3} plasma instance of Leap Web3
 * @param {LeapTransaction} tx
 * @returns {Promise<Proof>} promise that resolves to period inclusion proof
 */
export function getProof(plasma, tx, slotId, validatorAddr) {
  return Period.periodForTx(plasma, tx).then(period => {
    period.setValidatorData(slotId, validatorAddr);
    return period.proof(Tx.fromRaw(tx.raw));
  });
}
