require("@nomiclabs/hardhat-etherscan")
require("@nomiclabs/hardhat-waffle")
require("hardhat-gas-reporter")
require("hardhat-deploy")
require("dotenv").config()
require("hardhat-contract-sizer")
require("solidity-coverage")

module.exports = {
    solidity: {
        compilers: [
            { version: "0.8.9" },
            { version: "0.7.6" },
            { version: "0.4.18" },
        ],
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 1337,
            blockConfirmations: 1,
        },
        ogoerli: {
            chainId: 420,
            url: process.env.OGOERLI_URL || "",
            accounts: [process.env.PRIVATE_KEY],
            blockConfirmations: 6,
        },
        mumbai: {
            chainId: 80001,
            url: process.env.MUMBAI_URL || "",
            accounts: [process.env.PRIVATE_KEY],
            blockConfirmations: 6,
        },
    },
    gasReporter: {
        enabled: true,
        currency: "USD",
        gasPrice: 100,
        noColors: true,
        coinmarketcap: process.env.COINMARKETCAP_API,
        outputFile: "gas-report.txt",
    },
    etherscan: {
        apiKey: {
            mumbai: process.env.POLYGONSCAN_API_KEY,
            polygon: process.env.POLYGONSCAN_API_KEY,
        },
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
        user: {
            default: 1,
        },
    },
}
