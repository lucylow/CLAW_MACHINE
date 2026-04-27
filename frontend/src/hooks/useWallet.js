import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

// 0G Labs Testnet chain config
const OG_CHAIN = {
  chainId: '0x40d8',       // 16600 decimal
  chainName: '0G-Newton-Testnet',
  nativeCurrency: { name: '0G', symbol: 'A0GI', decimals: 18 },
  rpcUrls: ['https://evmrpc-testnet.0g.ai'],
  blockExplorerUrls: ['https://chainscan-newton.0g.ai'],
};

const SUPPORTED_CHAINS = {
  16600: '0G Testnet',
  1: 'Ethereum Mainnet',
  11155111: 'Sepolia',
};

export function useWallet() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const getNetworkName = (id) => SUPPORTED_CHAINS[id] || `Chain ${id}`;

  const refreshBalance = useCallback(async (addr, prov) => {
    if (!addr || !prov) return;
    try {
      const bal = await prov.getBalance(addr);
      setBalance(ethers.formatEther(bal));
    } catch {
      setBalance(null);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError('No wallet detected. Please install MetaMask.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await web3Provider.send('eth_requestAccounts', []);
      const network = await web3Provider.getNetwork();
      const web3Signer = await web3Provider.getSigner();

      setProvider(web3Provider);
      setSigner(web3Signer);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      await refreshBalance(accounts[0], web3Provider);
    } catch (err) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  }, [refreshBalance]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setChainId(null);
    setBalance(null);
    setProvider(null);
    setSigner(null);
    setError(null);
  }, []);

  const switchTo0G = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: OG_CHAIN.chainId }],
      });
    } catch (switchErr) {
      if (switchErr.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [OG_CHAIN],
          });
        } catch (addErr) {
          setError('Failed to add 0G network: ' + addErr.message);
        }
      } else {
        setError('Failed to switch network: ' + switchErr.message);
      }
    }
  }, []);

  const signMessage = useCallback(async (message) => {
    if (!signer) throw new Error('Wallet not connected');
    return signer.signMessage(message);
  }, [signer]);

  // Auto-reconnect if previously connected
  useEffect(() => {
    if (!window.ethereum) return;
    const tryAutoConnect = async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          await connect();
        }
      } catch {
        // silent fail
      }
    };
    tryAutoConnect();
  }, [connect]);

  // Listen for account/chain changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setAccount(accounts[0]);
        if (provider) await refreshBalance(accounts[0], provider);
      }
    };

    const handleChainChanged = (hexChainId) => {
      setChainId(parseInt(hexChainId, 16));
      // Reload provider on chain change
      if (window.ethereum) {
        const newProvider = new ethers.BrowserProvider(window.ethereum);
        setProvider(newProvider);
        newProvider.getSigner().then(setSigner).catch(() => {});
        if (account) refreshBalance(account, newProvider);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [account, provider, disconnect, refreshBalance]);

  return {
    account,
    chainId,
    balance,
    provider,
    signer,
    isConnecting,
    error,
    isConnected: !!account,
    networkName: chainId ? getNetworkName(chainId) : null,
    is0GNetwork: chainId === 16600,
    connect,
    disconnect,
    switchTo0G,
    signMessage,
  };
}
