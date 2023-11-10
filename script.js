// The list of words for the child to practice
const originalWordsToPractice = ["apple", "banana", "bathroom", "bedroom", "car", "carrot", "cat", "chair", "chimpanzee", "computer", "dad", "day", "dog", "drums", "ear", "fall", "feet", "fridge", "garlic", "gorilla", "guitar", "hand", "happiness", "harmonica", "hawk", "house", "ice", "jellyfish", "lemon", "lion", "milk", "mom", "motorcycle", "night", "onion", "orange", "parrot", "pepper", "plane", "potato", "salt", "school", "spacecraft", "spring", "summer", "table", "tomato", "violin", "wall", "water", "whale", "winter"];

// Clone the original array to manipulate
let wordsToPractice = [...originalWordsToPractice];

// Initialize the counter
let wordsTypedCount = 0;

// Prevent the glitch of re-typing words quickly
let inputLocked = false;

// Function to play the word sound
function playWordSound(word, callback) {
  const wordSound = new Audio(`sounds/word_sounds/English/${word}.mp3`);
  wordSound.play();

  // When the sound has finished playing, call the callback if provided
  wordSound.onended = () => {
    if (callback) {
      callback();
    }
  };
}

// Function to play the letter sound
function playLetterSound(letter) {
  const letterSound = new Audio(`sounds/letter%20sounds/${letter.toUpperCase()}.wav`);
  letterSound.play();
}

// Function to play the success sound
function playSuccessSound() {
  const successSound = new Audio('sounds/success/fanfare.mp3');
  successSound.play();
}

// This function should visually update the word display with underscores for each letter
function updateDisplayedWord(word) {
  const wordDisplay = document.getElementById('wordDisplay');
  const styledOverlay = document.getElementById('styledOverlay');
  const wordInput = document.getElementById('wordInput');
  
  wordDisplay.innerHTML = ''; // Clear the previous word display
  styledOverlay.innerHTML = ''; // Clear the styled overlay
  wordInput.value = ''; // Clear the input box

  // Create an underscore for each letter in the word with a margin for separation
  for (let i = 0; i < word.length; i++) {
    const underscoreSpan = document.createElement('span');
    underscoreSpan.textContent = '_';
    underscoreSpan.style.marginRight = '5px'; // Adjust the margin as needed for separation
    underscoreSpan.className = 'underscore';
    underscoreSpan.id = `letter${i}`; // Set the ID for each span to be used later
    wordDisplay.appendChild(underscoreSpan);
  }
}

// Function to show a message below the word input
function showMessage(message) {
  const messageElement = document.getElementById('message');
  messageElement.textContent = message;
}

// Function to update counter
function updateWordsTypedCountDisplay() {
  const countDisplay = document.getElementById('counter');
  countDisplay.textContent = `${wordsTypedCount}`;
}

// This function handles the user's input and updates the visual feedback
function handleKeyPress(event) {
  // Early exit if input is locked
  if (inputLocked) {
    return;
  }
  const typedWord = wordInput.value.toLowerCase();
  const currentWord = wordInput.dataset.currentWord.toLowerCase();

  updateDisplayedLetters(typedWord, currentWord);
  overlayTypedWord(typedWord, currentWord);

  // If the word is fully and correctly typed
  if (typedWord === currentWord && typedWord.length === currentWord.length) {
    handleCorrectWord(currentWord);
  }
}

// Function to overlay the styled text
function overlayTypedWord(typedWord, currentWord) {
  const overlayElement = document.getElementById('styledOverlay');
  overlayElement.innerHTML = ''; // Clear the existing content

  // Convert currentWord to lowercase for case-insensitive comparison
  const lowerCaseCurrentWord = currentWord.toLowerCase();

  // Create a styled version of the typed word
  for (let i = 0; i < typedWord.length; i++) {
    const span = document.createElement('span');
    // Compare the lowercase versions of the characters
    if (typedWord[i].toLowerCase() === lowerCaseCurrentWord[i]) {
      // Letter is correct
      span.textContent = typedWord[i]; // Display the character as typed by the user
      span.classList.add('correct-letter');
    } else {
      // Letter is incorrect
      span.textContent = typedWord[i]; // Display the character as typed by the user
      span.classList.add('incorrect-letter');
    }
    overlayElement.appendChild(span);
  }
}

// This new function updates the displayed underscores/letters as the user types
function updateDisplayedLetters(typedWord, currentWord) {
  for (let i = 0; i < currentWord.length; i++) {
    const letterElement = document.getElementById(`letter${i}`);
    
    if (i < typedWord.length) {
      // Reveal the letter if it's correct
      if (typedWord[i] === currentWord[i]) {
        letterElement.textContent = typedWord[i];
        letterElement.style.marginRight = '0'; // Reduce or remove the margin for letters
      } else {
        letterElement.textContent = '_';
        letterElement.style.marginRight = '5px'; // Adjust the margin as needed for underscores
      }
    } else {
      // Display an underscore if the letter hasn't been typed yet
      letterElement.textContent = '_';
      letterElement.style.marginRight = '5px'; // Adjust the margin as needed for underscores
    }
  }
}

// This new function handles everything that should happen when the word is typed correctly
function handleCorrectWord(currentWord) {
  inputLocked = true;

  // Delay after the last letter sound before playing the word sound again
  setTimeout(() => {
    playWordSound(currentWord, () => {
      // Determine the delay for the success sound based on the word's length
      let successSoundDelay = determineSuccessSoundDelay(currentWord);

      // Delay the success sound based on the length of the word
      setTimeout(() => {
        playSuccessSound();
      }, successSoundDelay);

      // Show the success message shortly after the success sound starts
      setTimeout(() => {
        showMessage('Good job! That\'s correct!');
        confetti(); // Play the success animation here
        wordsTypedCount++; // Increment the words typed count
        updateWordsTypedCountDisplay(); // Update the display
      }, successSoundDelay - 300);

      // Clear the input and set a new word a bit after the message is displayed
      setTimeout(() => {
        wordInput.value = ''; // Clear the input field
        setNewWord(); // Set a new word
      }, successSoundDelay + 2000); // This waits a bit after the message to reset
    });
  }, 500); // Delay before replaying the word sound after the last letter sound
}

// Helper function to determine the delay for the success sound based on word length
function determineSuccessSoundDelay(word) {
  if (word.length <= 4) {
    return 400;
  } else if (word.length >= 5 && word.length <= 9) {
    return 480;
  } else { // for 10 letters or more
    return 600;
  }
}

function setNewWord() {
  // Check if there are no more words to practice
  if (wordsToPractice.length === 0) {
    // Reset the wordsToPractice array to start over
    wordsToPractice = [...originalWordsToPractice];
    showMessage('All words completed! Starting again...');
    wordsTypedCount = 0; // Reset the count if needed
    updateWordsTypedCountDisplay();
  }

  // Choose a random word from the array
  const randomIndex = Math.floor(Math.random() * wordsToPractice.length);
  const newWord = wordsToPractice[randomIndex];

  // Display underscores for the new word
  updateDisplayedWord(newWord);

  // Set the image source based on the new word
  const wordImage = document.getElementById('wordImage');
  wordImage.src = `images/${newWord}.png`;
  wordImage.style.display = 'block'; // Show the image

  // Remove the used word from the array
  wordsToPractice.splice(randomIndex, 1);

  // Store the current word in the dataset and set the maxlength attribute
  wordInput.dataset.currentWord = newWord;
  wordInput.setAttribute('maxlength', newWord.length);

  // Clear any previous messages
  showMessage('');

  // Unlock the input for the new word
  inputLocked = false;

  // Clear the input field and the styled overlay for the new word
  wordInput.value = '';
  document.getElementById('styledOverlay').innerHTML = '';

  // Play the sound of the new word
  playWordSound(newWord);
}

document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.container');
  container.classList.add('fade-in');

  // Initialize wordInput here after the DOM has loaded
  const wordInput = document.getElementById('wordInput');
  wordInput.placeholder = "Press Enter to listen";

  // Combined keyup event listener for playing letter sounds and the entire word
  wordInput.addEventListener('keyup', function(event) {
    // Play the sound of the whole word when Enter is pressed
    if (event.code === 'Enter') {
      event.preventDefault(); // Prevent any default action
      playWordSound(wordInput.dataset.currentWord);
    }
    // Play the sound of the letter typed
    else if (event.key.length === 1 && event.key.match(/[a-z]/i)) {
      playLetterSound(event.key);
    }
  });

  // Set the initial word and focus on the input field
  setNewWord();
  wordInput.focus();
  
  // Now it's safe to add event listeners to wordInput
  wordInput.addEventListener('input', handleKeyPress);
});


  



