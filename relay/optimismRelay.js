const { ethers, getNamedAccounts } = require("hardhat")
const abi = require("./abis.json")
require("dotenv").config()

const polyAddress = "0x4DaF6286C410cBDB30B597b3256E337625422870"
const optiAddress = "0xdc86E2397E89cc5E68aDe54B258dc097FEbB0bf8"

const polyRPC = process.env.MUMBAI_URL

const optiRelay = async () => {
    const alchemy = new ethers.providers.JsonRpcProvider(polyRPC)
    const polyBridge = new ethers.Contract(polyAddress, abi.Polygon, alchemy)

    polyBridge.on("bridgeInitiated", (userAddress, bridgedAmount, fee) => {
        console.log("Polygon to Optimism bridge intitated")
        completeBridge(userAddress, bridgedAmount, fee)
    })

    polyBridge.on("bridgeReverted", (user, bridgedAmount, fee) => {
        console.log("Opti to Poly bridge tx reverted")
        revertBridge(user, bridgedAmount, fee)
    })
}

const completeBridge = async (user, bridgedAmount, fee) => {
    deployer = (await getNamedAccounts()).deployer
    optiBridge = await ethers.getContractAt(
        "OptimismBridgeV1",
        optiAddress,
        deployer
    )

    try {
        await optiBridge.sendBridgedFunds(user, bridgedAmount, fee)
        console.log(
            `Polygon => Optimism bridge for ${ethers.utils.formatEther(
                bridgedAmount.toString()
            )} ETH.`
        )
    } catch (e) {
        console.log(e)
    }
}

const revertBridge = async (user, bridgedAmount, fee) => {
    deployer = (await getNamedAccounts()).deployer
    optiBridge = await ethers.getContractAt(
        "OptimismBridgeV1",
        optiAddress,
        deployer
    )

    try {
        await optiBridge.refund(user, bridgedAmount, fee)
        console.log(
            `Refunded ${ethers.utils
                .formatEther(bridgedAmount.add(fee))
                .toString()} on Optimism.`
        )
    } catch (e) {
        console.log(e)
    }
}

optiRelay()
