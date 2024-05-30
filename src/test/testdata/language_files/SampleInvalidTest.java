package com.sample.project.common.client.samplepackage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import com.uber.testing.base.TestBase;
import org.junit.Test;

public class SampleValidExampleTest {
  @Test
  public void testGetInstance() {
    SampleClientProvider instance =
        SampleClientProvider.getInstance("sample");
    assertNotNull(instance);
  }

  @Test
  public void testGetSampleClient() {
    SampleClientProvider instance =
        SampleClientProvider.getInstance("sample");
    StatementRenderingClient clientA = instance.getSampleClient();
    StatementRenderingClient clientB = instance.getSampleClient();
    assertNotNull(clientA);
    assertEquals(clientA, clientB);
  }
}
