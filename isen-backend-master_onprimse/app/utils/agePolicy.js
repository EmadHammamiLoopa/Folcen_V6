'use strict';

/**
 * Parse an application birth-date value as a calendar date.
 *
 * Folcen stores birthday selections as YYYY-MM-DD. Using calendar components
 * avoids timezone shifts that can occur when Date parses a date-only string as
 * UTC.
 */
function parseBirthDate(value) {
  const match = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    year,
    month - 1,
    day
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}


/**
 * Folcen product policy is 18+.
 *
 * A user becomes eligible on the calendar date of their eighteenth birthday.
 * Feb-29 birthdays naturally normalize to Mar-1 in a non-leap eighteenth year.
 */
function isAtLeast18(
  birthDate,
  now = new Date()
) {
  const birth =
    parseBirthDate(birthDate);

  if (!birth) {
    return false;
  }

  const eighteenthBirthday =
    new Date(
      birth.getFullYear() + 18,
      birth.getMonth(),
      birth.getDate()
    );

  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  return (
    eighteenthBirthday.getTime() <=
    today.getTime()
  );
}


module.exports = {
  isAtLeast18,
  parseBirthDate
};
