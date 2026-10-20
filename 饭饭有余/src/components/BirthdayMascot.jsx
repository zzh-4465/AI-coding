import React from 'react';
import sprites from '../assets/birthday-dog-sprites.png';
import birthdaySprites from '../assets/birthday-dog-ageless.png';
import { birthdayEdition } from '../pet.js';
import './BirthdayMascot.css';

export default function BirthdayMascot({ ordinary = false, reaction = '', motion = 'idle', stage = 'normal', age = birthdayEdition().age }) {
  const action = ordinary ? 'ordinary' : ({ petted: 'laugh', poked: 'laugh', spinning: 'celebrate', dizzy: 'laugh' }[reaction] || motion);
  return <span className={`birthday-mascot action-${action} birthday-stage-${stage}`} data-action={action} data-age={ordinary ? undefined : age} aria-hidden="true">
    <span className="birthday-sprite" style={{ backgroundImage: `url(${ordinary ? sprites : birthdaySprites})` }}>
      {!ordinary && <span className="birthday-age" data-cake-age={age}>{String(age).split('').map((digit, index) => <i key={index}>{digit}</i>)}</span>}
    </span>
    {!ordinary && <span className="birthday-sparks"><i>✦</i><i>✧</i><i>✦</i><i>✧</i><i>✦</i></span>}
  </span>;
}
