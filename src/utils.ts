import { BitcoinCoreClient } from "@interlay/interbtc";

export async function waitForEmptyMempool(bitcoinCoreClient: BitcoinCoreClient): Promise<void> {
    while((await bitcoinCoreClient.getMempoolInfo()).size === 0) {
        await sleep(1000);
    }
}

export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}