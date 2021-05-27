import {
    createPolkabtcAPI,
    PolkaBTCAPI,
    sleep,
} from "@interlay/polkabtc";
import { KeyringPair } from "@polkadot/keyring/types";
import { Keyring } from "@polkadot/api";
import Big from "big.js";
import {cryptoWaitReady} from "@polkadot/util-crypto";

import { MS_IN_AN_HOUR } from "./consts";
import { Issue } from "./issue";
import { Redeem } from "./redeem";

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv))
    .option('heartbeats', {
        type: 'boolean',
        description: 'Try to issue and redeem slightly more than the redeem dust value with every registered vault. Mutually exclusive with the `execute-pending-redeems` flag.',
        default: true
    })
    .option('wait-interval', {
        type: 'number',
        description: 'Delay between rounds of issuing and reddeming with each vault in the system. Example: 2 => issue and redeem every two hours.',
        default: 8
    })
    .option('execute-pending-redeems', {
        type: 'boolean',
        description: 'Try to execute redeem requests whose BTC payment has already been made. Mutually exclusive with the `heartbeats` flag.',
        default: false
    })
    .argv

enum InputFlag {
    heartbeats,
    executePendingRedeems
}

function parseArgs(argv: any): [InputFlag, number] {
    if(argv.executePendingRedeems) {
        return [InputFlag.executePendingRedeems, argv.waitInterval * MS_IN_AN_HOUR];
    }
    return [InputFlag.heartbeats, argv.waitInterval * MS_IN_AN_HOUR];
}

let keyring = new Keyring({ type: "sr25519" });

main(...parseArgs(argv))
    .catch((err) => {
        console.log(
            `[${new Date().toLocaleString()}] Error during bot operation: ${err}`
        );
        console.log(err);
    });

function connectToParachain(): Promise<PolkaBTCAPI> {
    if (!process.env.BITCOIN_NETWORK || !process.env.PARACHAIN_URL) {
        Promise.reject("Parachain URL and Bitcoin network environment variables not set");
    }
    return createPolkabtcAPI(process.env.PARACHAIN_URL as string, process.env.BITCOIN_NETWORK);
}

async function heartbeats(account: KeyringPair, redeemAddress: string): Promise<void> {
    try {
        const polkaBtcApi = await connectToParachain();
        polkaBtcApi.setAccount(account);
        if (
            !process.env.BITCOIN_RPC_HOST
            || !process.env.BITCOIN_RPC_PORT
            || !process.env.BITCOIN_RPC_USER
            || !process.env.BITCOIN_RPC_PASS
            || !process.env.BITCOIN_NETWORK
            || !process.env.BITCOIN_RPC_WALLET
            || !process.env.REDEEM_ADDRESS
            || !process.env.ISSUE_TOP_UP_AMOUNT
        ) {
            console.log("Bitcoin Node environment variables not set. Not performing issue and redeem heartbeats.");
        } else {
            const issue = new Issue(polkaBtcApi);
            await issue.performHeartbeatIssues(
                account,
                process.env.BITCOIN_RPC_HOST,
                process.env.BITCOIN_RPC_PORT,
                process.env.BITCOIN_RPC_USER,
                process.env.BITCOIN_RPC_PASS,
                process.env.BITCOIN_NETWORK,
                process.env.BITCOIN_RPC_WALLET
            );
            const redeem = new Redeem(polkaBtcApi, new Big(process.env.ISSUE_TOP_UP_AMOUNT as string));
            await redeem.performHeartbeatRedeems(
                account,
                redeemAddress,
                process.env.BITCOIN_RPC_HOST,
                process.env.BITCOIN_RPC_PORT,
                process.env.BITCOIN_RPC_USER,
                process.env.BITCOIN_RPC_PASS,
                process.env.BITCOIN_NETWORK,
                process.env.BITCOIN_RPC_WALLET
            );
            const aliveVaults = await redeem.getAliveVaults();
            console.log("Vaults that redeemed within the last 12 hours:");
            aliveVaults.forEach(vault => console.log(`${vault[0]}, at ${new Date(vault[1]).toLocaleString()}`))
        }
    } catch (error) {
        console.log(error);
    }
}

async function main(inputFlag: InputFlag, requestWaitingTime: number) {
    if (!process.env.POLKABTC_BOT_ACCOUNT) {
        Promise.reject("Bot account mnemonic not set in the environment");
    }
    await cryptoWaitReady();
    await sleep(5000);
    let account = keyring.addFromUri(`${process.env.POLKABTC_BOT_ACCOUNT}`);
    console.log(`Bot account: ${account.address}`);
    console.log(`Waiting time between bot runs: ${requestWaitingTime / (60 * 60 * 1000)} hours`);
    
    switch(inputFlag) {
        case(InputFlag.executePendingRedeems): {
            if (!process.env.REDEEM_ADDRESS) {
                Promise.reject("Redeem Bitcoin address not set in the environment");
            }
            const polkaBtcApi = await connectToParachain();
            polkaBtcApi.setAccount(account);
            const redeem = new Redeem(polkaBtcApi);
            await redeem.executePendingRedeems();
            break;
        }
        case(InputFlag.heartbeats): {
            heartbeats(account, process.env.REDEEM_ADDRESS as string);
            setInterval(heartbeats, requestWaitingTime, account);
            break;
        }
    }

}
