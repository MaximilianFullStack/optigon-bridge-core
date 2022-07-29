// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/** @title Optigon Bridge Contract V1
 *  @notice Allows users to deposit ether on Optimism and then inform the relayer of the transcation. Also is called by relayer
 *  to send ether and thus complete the transcations.
 */
contract OptimismBridgeV1 is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    /// fee is divided from the transaction amount; 334 is about a 0.3% fee
    uint256 public constant ADMIN_FEE = 334;
    uint256 public generatedFees;
    uint256 public availbleLiquidity;

    /// staking positions per address
    mapping(address => uint256) public stakedPosition;
    mapping(address => uint256) public poolShare;

    address[] public liquidityProviders;

    /* === EVENTS === */

    event bridgeInitiated(
        address userAddress,
        uint256 bridgedAmount,
        uint256 fee,
        uint256 block
    );
    event bridgeReverted(
        address user,
        uint256 bridgedAmount,
        uint256 fee,
        string reason,
        uint256 block
    );

    /* === RECIEVE FUNCTION === */

    receive() external payable {
        generatedFees = SafeMath.add(generatedFees, msg.value);
    }

    /* === FALLBACK FUNCTION === */

    fallback() external {}

    /* === EXTERNAL FUNCTIONS === */

    /** @notice Recieves a quantity of ether and then sends tx data via an event **/
    function bridgeEther() external payable nonReentrant {
        require(msg.value > 0, "Zero value input");

        /// caluclates fee and takes it out of amount being bridged
        uint256 fee = SafeMath.div(msg.value, ADMIN_FEE);
        uint256 send = SafeMath.sub(msg.value, fee);

        /// updates the total generated fees
        generatedFees = SafeMath.add(generatedFees, fee);

        /// updates the availble liquidity
        availbleLiquidity = SafeMath.sub(address(this).balance, generatedFees);

        /// emits data for relayer to input on Polygon chain contract
        emit bridgeInitiated(msg.sender, send, fee, block.number);
    }

    /** @notice if the bridged token from polygon is wETH, fuction will send ether to the user. Otherwise
     * it will send the bridged erc-20 token. **/
    function sendBridgedFunds(
        address userAddress,
        uint256 bridgedAmount,
        uint256 fee
    ) external onlyOwner nonReentrant {
        require(bridgedAmount > fee, "Invalid tx input");

        /// checks if contract has enough eth to pay user
        if (availbleLiquidity > bridgedAmount) {
            /// pays user the bridged amount
            payable(userAddress).transfer(bridgedAmount);

            /// updates availble liquidity
            availbleLiquidity = SafeMath.sub(
                address(this).balance,
                generatedFees
            );
        } else {
            /// informs the relayer that the tx needs to be reverted
            emit bridgeReverted(
                userAddress,
                bridgedAmount,
                fee,
                "Not enough liquidity",
                block.number
            );
        }
    }

    /** @notice refunds a user's tx when briding can not be completed **/
    function refund(
        address userAddress,
        uint256 bridgedAmount,
        uint256 fee
    ) external onlyOwner nonReentrant {
        require(bridgedAmount > fee, "Invalid tx input");

        /// caluclates the total they paid from the amount being bridged and their fee
        uint256 refundAmount = SafeMath.add(bridgedAmount, fee);

        /// pays the user the amount that needs to be refunded
        payable(userAddress).transfer(refundAmount);

        /// updates the total generated fees
        generatedFees = SafeMath.sub(generatedFees, fee);

        /// updates available liquidity
        availbleLiquidity = SafeMath.sub(address(this).balance, generatedFees);
    }

    /** @notice allows users to deposit ether into the pool (available liquidity) **/
    function stake() external payable nonReentrant {
        require(msg.value > 0, "Zero value input");
        require(stakedPosition[msg.sender] == 0, "User already has a position");

        /// adds stake data for user address
        stakedPosition[msg.sender] = msg.value;
        liquidityProviders.push(msg.sender);

        /// updates the available liquidity
        availbleLiquidity = SafeMath.sub(address(this).balance, generatedFees);

        /// maps their ownership percentage of the pool of 1e18
        uint256 percent = SafeMath.mul(msg.value, 1 ether);
        poolShare[msg.sender] = SafeMath.div(percent, availbleLiquidity); // 1% = 1e16
    }

    /** @notice allows users to remove their ether from the pool (available liquidity) **/
    function unStake() external nonReentrant {
        require(stakedPosition[msg.sender] > 0, "User has no ether staked");

        /// pays user their staked position
        payable(msg.sender).transfer(stakedPosition[msg.sender]);

        /// removes stake data for user address
        delete stakedPosition[msg.sender];
        delete poolShare[msg.sender];

        /// updates the available liquidity
        availbleLiquidity = SafeMath.sub(address(this).balance, generatedFees);
    }

    /* === PUBLIC FUNCTIONS === */

    /** @notice distuributes the generated fees amoung the owner and the liquidity providers **/
    function distributeFees() public {
        require(generatedFees > 0, "No fees generated");

        /// if there are no liquidity providers, all the feea are trasfered to the owner
        if (totalLiquidityProviders() == 0) {
            payable(owner()).transfer(generatedFees);
        } else {
            /// trasfers half the fees to the owner
            uint256 devFees = SafeMath.div(generatedFees, 2);
            payable(owner()).transfer(devFees);

            /// iterates through the liquidity providers and pays them based on their share of the pool
            for (uint256 i = 0; i < totalLiquidityProviders(); i++) {
                address addr = liquidityProviders[i];

                /// updates pool share
                uint256 percent = SafeMath.mul(stakedPosition[addr], 1 ether);
                if (percent > 0) {
                    poolShare[addr] = SafeMath.div(percent, availbleLiquidity); // 1% == 1e16

                    /// determine amount to pay and pay user
                    uint256 amount = SafeMath.mul(poolShare[addr], devFees);
                    uint256 pay = SafeMath.div(amount, 1 ether);
                    payable(addr).transfer(pay);
                }
            }
        }

        /// updates the total generated fees
        generatedFees = 0;

        /// updates the available liquidity
        availbleLiquidity = SafeMath.sub(address(this).balance, generatedFees);
    }

    /* === VIEW FUNCTIONS === */

    function userStakedAmount(address user) public view returns (uint256) {
        return stakedPosition[user];
    }

    function totalLiquidityProviders() public view returns (uint256) {
        return liquidityProviders.length;
    }

    function totalGeneratedFees() public view returns (uint256) {
        return generatedFees;
    }

    function adminFee() public pure returns (uint256) {
        return ADMIN_FEE;
    }

    function TLV() public view returns (uint256) {
        return availbleLiquidity;
    }
}
