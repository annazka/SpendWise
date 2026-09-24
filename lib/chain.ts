import { BrowserProvider, Contract, encodeBytes32String, isAddress, keccak256, toUtf8Bytes } from "ethers";

const ABI = [
  "function recordExpense(bytes32 expenseId,uint256 amountMinor,bytes3 currency,bytes32 detailsHash,uint32 date)",
];

function ethereum() {
  const provider = (window as Window & { ethereum?: { request(args: unknown): Promise<unknown> } }).ethereum;
  if (!provider) throw new Error("Install MetaMask or open SpendWise in a wallet-enabled browser.");
  return provider;
}

export async function authenticateWallet() {
  const provider = ethereum();
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  const wallet = accounts[0];
  if (!wallet) throw new Error("No wallet account was selected.");
  const challengeResponse = await fetch("/api/auth/challenge", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }),
  });
  const challenge = await challengeResponse.json() as { message?: string; error?: string };
  if (!challengeResponse.ok || !challenge.message) throw new Error(challenge.error || "Could not create a wallet challenge.");
  const signature = await provider.request({ method: "personal_sign", params: [challenge.message, wallet] }) as string;
  const verifyResponse = await fetch("/api/auth/verify", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet, signature }),
  });
  const verified = await verifyResponse.json() as { wallet?: string; error?: string };
  if (!verifyResponse.ok || !verified.wallet) throw new Error(verified.error || "Wallet verification failed.");
  return verified.wallet;
}

export async function ensureBotChainNetwork(config: { chainId: number; rpc: string; explorer: string }) {
  const injected = ethereum();
  const chainId = `0x${Number(config.chainId).toString(16)}`;
  try {
    await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902) throw new Error("Switch MetaMask to BOT Chain Mainnet and try again.");
    await injected.request({ method: "wallet_addEthereumChain", params: [{
      chainId,
      chainName: config.chainId === 677 ? "BOT Chain Mainnet" : "BOT Chain Testnet",
      nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
      rpcUrls: [config.rpc],
      blockExplorerUrls: [config.explorer],
    }] });
  }
}

export async function recordExpense(
  expense: { id: string; store: string; date: string; amountMinor: number; currency: string; category: string; receiptHash: string },
  config: { contractAddress: string; chainId: number; rpc: string; explorer: string },
) {
  if (!isAddress(config.contractAddress)) return { txHash: null, onchainId: null, url: null };
  const injected = ethereum();
  await ensureBotChainNetwork(config);
  const provider = new BrowserProvider(injected as never);
  if (await provider.getCode(config.contractAddress) === "0x") throw new Error("No SpendWise contract exists at the configured address.");
  const signer = await provider.getSigner();
  const owner = await signer.getAddress();
  const expenseId = keccak256(toUtf8Bytes(`${owner.toLowerCase()}:${expense.id}`));
  const detailsHash = keccak256(toUtf8Bytes(JSON.stringify({
    store: expense.store,
    date: expense.date,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    category: expense.category,
    receiptHash: expense.receiptHash,
  })));
  const numericDate = Number(expense.date.replaceAll("-", ""));
  const currencyBytes = encodeBytes32String(expense.currency).slice(0, 8);
  const contract = new Contract(config.contractAddress, ABI, signer);
  const transaction = await contract.recordExpense(expenseId, expense.amountMinor, currencyBytes, detailsHash, numericDate);
  const receipt = await transaction.wait();
  if (receipt?.status !== 1) throw new Error("BOT Chain rejected the expense transaction.");
  return { txHash: transaction.hash as string, onchainId: expenseId, url: `${config.explorer}/tx/${transaction.hash}` };
}
