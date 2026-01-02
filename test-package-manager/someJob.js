const someJob = async () => {
  await new Promise(resolve => setTimeout(resolve, 5000));
}

someJob();
