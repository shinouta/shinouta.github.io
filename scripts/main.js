const myImage = document.querySelector('img')

myImage.onclick = () => {
  const mySrc = myImage.getAttribute('src');
  if (mySrc === 'images/genbaneko.png'){
    myImage.setAttribute('src', 'images/genbaneko2.png');
  }else{
    myImage.setAttribute('src', 'images/genbaneko.png');
  }
}

let myButton = document.querySelector('button');
let myHeading = document.querySelector('h1');

function setUserName(){
  const myName = prompt('Enter your name');
  if(!myName){
    setUserName();
  }else{
    localStorage.setItem('name', myName);
    myHeading.textContent = `Genbaneko Cat is cool, isn\'t it? ${myName}`;
  }
}

if (!localStorage.getItem('name')) {
  setUserName();
} else {
  const storedName = localStorage.getItem('name');
  myHeading.textContent = `Genbaneko Cat is cool, isn\'t it? ${storedName}`;
}

myButton.onclick = () => {
  setUserName();
}
