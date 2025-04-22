// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  // Instantiate managers first
  var storageManager = new LocalStorageManager;
  var inputManager = new KeyboardInputManager;
  var actuator = new HTMLActuator;

  // Instantiate GameManager, potentially passing botManager if needed later
  var gameManager = new GameManager(4, inputManager, actuator, storageManager);

  // Instantiate BotManager and pass GameManager
  var botManager = new BotManager(gameManager);

  // Now, pass botManager to GameManager AFTER both are created
  gameManager.setBotManager(botManager); 

  // Optional: If BotManager needs to listen to game events directly
  // botManager.listen(); // Assuming listen method exists and is necessary
});
