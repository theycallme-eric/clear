import { describe, expect, it } from 'vitest'
import { countdownWarningState } from './countdown-warning'
describe('deadline eligibility',()=>{
  it.each([null,NaN,Infinity,-1,0,11])('does not cue ineligible remaining time %s',remaining=>{
    expect(countdownWarningState(remaining,true)).toEqual({low:false,urgent:false})
  })
  it('uses low color at 10, stronger pulse at 5, and removes urgency on pause',()=>{
    expect(countdownWarningState(10,true)).toEqual({low:true,urgent:false})
    expect(countdownWarningState(5,true)).toEqual({low:true,urgent:true})
    expect(countdownWarningState(5,false)).toEqual({low:true,urgent:false})
  })
  it('excludes elapsed-only clocks and treats remaining cap time as a deadline',()=>{
    expect(countdownWarningState(5,true,true)).toEqual({low:false,urgent:false})
    expect(countdownWarningState(60-55,true)).toEqual({low:true,urgent:true})
  })
})
