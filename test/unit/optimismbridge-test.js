const { deployments, ethers, getNamedAccounts, waffle } = require("hardhat")
const { expect, assert } = require("chai")

const oneEth = ethers.utils.parseEther("1")
const oEthFee = oneEth.div(334)
const oEthBamt = oneEth.sub(oEthFee)

describe("OptimismBridgeV1", async function () {
    let bridge, deployer
    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["optimism"])
        bridge = await ethers.getContract("OptimismBridgeV1", deployer)
    })

    describe("recieve", async function () {
        it("adds ether to generated fees", async function () {
            const accounts = await ethers.getSigners()
            const genFees = await bridge.totalGeneratedFees()
            await accounts[1].sendTransaction({
                to: bridge.address,
                value: oneEth,
            })
            const genFees2 = await bridge.totalGeneratedFees()
            assert.equal(genFees.add(oneEth).toString(), genFees2.toString())
        })
    })
    describe("bridge", async function () {
        it("fails when inputing zero value", async function () {
            expect(bridge.bridgeEther({})).to.be.revertedWith(
                "Zero value input"
            )
        })
        it("intakes funds, updates generated fees and locked volume", async function () {
            const provider = await waffle.provider
            await bridge.bridgeEther({ value: oneEth })
            const contractBal = await provider.getBalance(bridge.address)
            const tlv = await bridge.TLV()
            const fee = await bridge.totalGeneratedFees()
            assert.equal(tlv.toString(), oEthBamt)
            assert.equal(fee.toString(), oEthFee)
            assert.equal(contractBal.toString(), tlv.add(fee).toString())
        })
        it("emits correct data", async function () {
            const tx = await bridge.bridgeEther({ value: oneEth })
            const transactionReceipt = await tx.wait()
            assert.equal(deployer, transactionReceipt.events[0].args[0])
            assert.equal(
                oEthBamt.toString(),
                transactionReceipt.events[0].args[1].toString()
            )
            assert.equal(
                oEthFee.toString(),
                transactionReceipt.events[0].args[2].toString()
            )
            assert.equal(
                transactionReceipt.blockNumber,
                transactionReceipt.events[0].args[3]
            )
        })
    })
    describe("sendBridgedFunds", async function () {
        it("fails if the fee is higher than bridged amount", async function () {
            expect(
                bridge.sendBridgedFunds(deployer, oEthFee, oEthBamt)
            ).to.be.revertedWith("Invalid tx input")
        })
        it("calls refund if there is not enough liquidity for tx", async function () {
            const tx = await bridge.sendBridgedFunds(
                deployer,
                oEthBamt,
                oEthFee
            )
            const transactionReceipt = await tx.wait()
            assert.equal(
                "Not enough liquidity",
                transactionReceipt.events[0].args[3]
            )
        })
        it("emits correct data on revert event", async function () {
            const tx = await bridge.sendBridgedFunds(
                deployer,
                oEthBamt,
                oEthFee
            )
            const transactionReceipt = await tx.wait()
            assert.equal(deployer, transactionReceipt.events[0].args[0])
            assert.equal(
                oEthBamt.toString(),
                transactionReceipt.events[0].args[1].toString()
            )
            assert.equal(
                oEthFee.toString(),
                transactionReceipt.events[0].args[2].toString()
            )
            assert.equal(
                "Not enough liquidity",
                transactionReceipt.events[0].args[3]
            )
            assert.equal(
                transactionReceipt.blockNumber,
                transactionReceipt.events[0].args[4]
            )
        })
        it("pays user and updates status variables", async function () {
            const accounts = await ethers.getSigners()
            await bridge.stake({ value: oneEth })
            await bridge.bridgeEther({ value: oneEth })
            const tlv1 = await bridge.TLV()
            const fee1 = await bridge.totalGeneratedFees()
            const uBal1 = await accounts[0].getBalance()
            const tx = await bridge.sendBridgedFunds(
                deployer,
                oEthBamt,
                oEthFee
            )
            const transactionReceipt = await tx.wait()
            const gas = await transactionReceipt.gasUsed
            const tlv2 = await bridge.TLV()
            const fee2 = await bridge.totalGeneratedFees()
            const uBa2 = await accounts[0].getBalance()
            assert.equal(tlv1.toString(), oneEth.add(oEthBamt).toString())
            assert.equal(fee1.toString(), oEthFee.toString())
            assert.equal(
                uBal1
                    .sub(gas.mul(transactionReceipt.effectiveGasPrice))
                    .toString(),
                uBa2.sub(oEthBamt)
            )
            assert.equal(tlv2.toString(), oneEth.toString())
            assert.equal(fee2.toString(), oEthFee.toString())
        })
    })
    describe("refund", async function () {
        it("fails when fee is larger than amount", async function () {
            expect(
                bridge.refund(deployer, oEthFee, oEthBamt)
            ).to.be.revertedWith("Invalid tx input")
        })
        it("refunds the user and updates status variables", async function () {
            const accounts = await ethers.getSigners()
            await bridge.bridgeEther({ value: oneEth })
            const uBal1 = await accounts[0].getBalance()
            const tlv1 = await bridge.TLV()
            const fee1 = await bridge.totalGeneratedFees()
            const tx = await bridge.refund(deployer, oEthBamt, oEthFee)
            const transactionReceipt = await tx.wait()
            const tlv2 = await bridge.TLV()
            const fee2 = await bridge.totalGeneratedFees()
            const uBal2 = await accounts[0].getBalance()
            assert.equal(
                uBal2
                    .add(
                        transactionReceipt.gasUsed.mul(
                            transactionReceipt.effectiveGasPrice
                        )
                    )
                    .toString(),
                uBal1.add(oneEth).toString()
            )
            assert.equal(tlv2.toString(), tlv1.sub(oEthBamt).toString())
            assert.equal(fee1.toString(), fee2.add(oEthFee).toString())
        })
    })
    describe("stake", async function () {
        it("fails with zero value", async function () {
            expect(bridge.stake({})).to.be.revertedWith("Zero value input")
        })
        it("fails if user already has a staked position", async function () {
            await bridge.stake({ value: oneEth })
            expect(bridge.stake({ walue: oneEth })).to.be.revertedWith(
                "User already has a position"
            )
        })
        it("adds to the liquidy pool and updates status arrays and mapping", async function () {
            await bridge.stake({ value: oneEth })
            const liquidProviders = await bridge.totalLiquidityProviders()
            const tlv = await bridge.TLV()
            const position = await bridge.stakedPosition(deployer)
            const shareOfPool = await bridge.poolShare(deployer)
            assert.equal(liquidProviders, 1)
            assert.equal(tlv.toString(), oneEth.toString())
            assert.equal(position.toString(), oneEth.toString())
            assert.equal(shareOfPool.toString(), oneEth)
        })
    })
    describe("unStake", async function () {
        it("fails if user does not have a position", async function () {
            expect(bridge.unStake()).to.be.revertedWith(
                "User has no ether staked"
            )
        })
        it("trasfers the funds to the staker and updates arrays and mappings", async function () {
            const accounts = await ethers.getSigners()
            const bal1 = await accounts[0].getBalance()
            const tx = await bridge.stake({ value: oneEth })
            const transactionReceipt = await tx.wait()
            const gasCost1 = transactionReceipt.gasUsed.mul(
                transactionReceipt.effectiveGasPrice
            )
            const tx2 = await bridge.unStake()
            const transactionReceipt2 = await tx2.wait()
            const gasCost2 = transactionReceipt2.gasUsed.mul(
                transactionReceipt2.effectiveGasPrice
            )
            const bal2 = await accounts[0].getBalance()
            const tlv = await bridge.TLV()
            const position = await bridge.stakedPosition(deployer)
            const shareOfPool = await bridge.poolShare(deployer)
            assert.equal(
                bal1.sub(gasCost1.add(gasCost2)).toString(),
                bal2.toString()
            )
            assert.equal(tlv.toString(), 0)
            assert.equal(position.toString(), 0)
            assert.equal(shareOfPool.toString(), 0)
        })
    })
    describe("distribute funds", async function () {
        it("fails if there are no generated fees", async function () {
            expect(bridge.distributeFees()).to.be.revertedWith(
                "No fees generated"
            )
        })
        it("distributes all fees to the owner if there are no liquidity providers", async function () {
            const accounts = await ethers.getSigners()
            await bridge.bridgeEther({ value: oneEth })
            const bal1 = await accounts[0].getBalance()
            const tx = await bridge.distributeFees()
            const transactionReceipt = await tx.wait()
            const bal2 = await accounts[0].getBalance()
            assert.equal(
                bal2
                    .add(
                        transactionReceipt.gasUsed.mul(
                            transactionReceipt.effectiveGasPrice
                        )
                    )
                    .toString(),
                bal1.add(oEthFee).toString()
            )
        })
        it("distrubutes fees to all parties according to pool share (stress test)", async function () {
            const accounts = await ethers.getSigners()

            // staking with various amounts
            bridge = await bridge.connect(accounts[11])
            await bridge.stake({ value: oneEth.mul(1500) })
            bridge = await bridge.connect(accounts[12])
            await bridge.stake({ value: oneEth.mul(450) })
            bridge = await bridge.connect(accounts[13])
            await bridge.stake({ value: oneEth.mul(3) })
            bridge = await bridge.connect(accounts[14])
            await bridge.stake({ value: oneEth.mul(78) })
            bridge = await bridge.connect(accounts[15])
            await bridge.stake({ value: oneEth.mul(16) })

            // initating bridge
            bridge = await bridge.connect(accounts[1])
            await bridge.bridgeEther({ value: oneEth.mul(2697) })
            bridge = await bridge.connect(accounts[2])
            await bridge.bridgeEther({ value: oneEth.mul(420) })
            bridge = await bridge.connect(accounts[3])
            await bridge.bridgeEther({ value: oneEth.mul(5) })
            bridge = await bridge.connect(accounts[4])
            await bridge.bridgeEther({ value: oneEth.mul(27) })

            // **simulating paying back on other network**
            bridge = await bridge.connect(accounts[0])
            await bridge.sendBridgedFunds(
                accounts[1].address,
                oEthBamt.mul(2697),
                oEthFee.mul(2697)
            )
            await bridge.sendBridgedFunds(
                accounts[2].address,
                oEthBamt.mul(420),
                oEthFee.mul(420)
            )
            await bridge.sendBridgedFunds(
                accounts[3].address,
                oEthBamt.mul(5),
                oEthFee.mul(5)
            )
            await bridge.sendBridgedFunds(
                accounts[4].address,
                oEthBamt.mul(27),
                oEthFee.mul(27)
            )

            // unstake
            bridge = await bridge.connect(accounts[14])
            await bridge.unStake()

            let genFees = await bridge.totalGeneratedFees()
            genFees = genFees.div(2)
            const pool = await bridge.TLV()
            const depBal = await accounts[0].getBalance()
            const liq1Bal = await accounts[11].getBalance()
            const liq2Bal = await accounts[12].getBalance()
            const liq3Bal = await accounts[13].getBalance()
            const liq4Bal = await accounts[15].getBalance()
            const unStakerBal = await accounts[14].getBalance()

            //distribute fees!
            bridge = await bridge.connect(accounts[16])
            await bridge.distributeFees()

            const depBal2 = await accounts[0].getBalance()
            const liq1Bal2 = await accounts[11].getBalance() // 1500 eth staked
            const liq1Share = (
                await bridge.poolShare(accounts[11].address)
            ).mul(genFees)
            const liq2Bal2 = await accounts[12].getBalance() // 450 eth staked
            const liq2Share = (
                await bridge.poolShare(accounts[12].address)
            ).mul(genFees)
            const liq3Bal2 = await accounts[13].getBalance() // 3 eth staked
            const liq3Share = (
                await bridge.poolShare(accounts[13].address)
            ).mul(genFees)
            const liq4Bal2 = await accounts[15].getBalance() // 16 eth staked
            const liq4Share = (
                await bridge.poolShare(accounts[15].address)
            ).mul(genFees)
            const unStakerBal2 = await accounts[14].getBalance()

            assert.equal(depBal2.sub(depBal).toString(), genFees.toString())
            assert.equal(
                liq1Bal2.sub(liq1Bal).toString(),
                liq1Share.div(oneEth).toString()
            )
            assert.equal(
                liq2Bal2.sub(liq2Bal).toString(),
                liq2Share.div(oneEth).toString()
            )
            assert.equal(
                liq3Bal2.sub(liq3Bal).toString(),
                liq3Share.div(oneEth).toString()
            )
            assert.equal(
                liq4Bal2.sub(liq4Bal).toString(),
                liq4Share.div(oneEth).toString()
            )
            assert.equal(unStakerBal2.sub(unStakerBal).toString(), 0)
        })
    })
})
