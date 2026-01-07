// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract Counter {
  uint public x;
  bool public initialized;

  event Increment(uint by);

  function initialize(uint256 _x) public {
    require(!initialized, "Counter: already initialized");
    x = _x;
  }

  function inc() public {
    x++;
    emit Increment(1);
  }

  function incBy(uint by) public {
    require(by > 0, "incBy: increment should be positive");
    x += by;
    emit Increment(by);
  }
}
